import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { buildValidationPipe } from '../src/app.setup';
import { signWebhookPayload } from '../src/billing/webhook-signature';

/**
 * Full API flow against a real PostgreSQL database (CI only):
 * register -> create org -> project -> task -> status -> comment -> refresh rotation -> api key.
 */
describe('LaunchPad API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let http: ReturnType<typeof request>;

  const stamp = Date.now();
  const owner = { email: `owner-${stamp}@example.com`, password: 'Password123!', name: 'Owner One' };
  const invitee = { email: `invitee-${stamp}@example.com`, password: 'Password123!', name: 'Invitee Two' };

  let accessToken = '';
  let refreshToken = '';
  let orgId = '';
  let projectId = '';
  let taskId = '';
  let labelId = '';

  const authed = (token = accessToken) => ({ Authorization: `Bearer ${token}`, 'X-Org-Id': orgId });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(buildValidationPipe());
    await app.init();
    http = request(app.getHttpServer());
    prisma = new PrismaClient();
    await prisma.plan.upsert({
      where: { id: 'FREE' },
      update: {},
      create: { id: 'FREE', name: 'Free', priceMonthly: 0, maxProjects: 3, maxMembers: 5, features: [] },
    });
    await prisma.plan.upsert({
      where: { id: 'PRO' },
      update: {},
      create: { id: 'PRO', name: 'Pro', priceMonthly: 1900, maxProjects: 25, maxMembers: 25, features: [] },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [owner.email, invitee.email] } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /health responds', async () => {
    const res = await http.get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body.data ?? res.body).toBeDefined();
  });

  it('POST /auth/register creates an account and returns tokens', async () => {
    const res = await http.post('/auth/register').send(owner).expect(201);
    expect(res.body.data.user.email).toBe(owner.email);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('POST /auth/register rejects duplicate emails with 409', async () => {
    const res = await http.post('/auth/register').send(owner).expect(409);
    expect(res.body.statusCode).toBe(409);
    expect(res.body.error).toBe('Conflict');
  });

  it('POST /auth/login rejects wrong passwords', async () => {
    await http.post('/auth/login').send({ email: owner.email, password: 'wrong-password' }).expect(401);
  });

  it('GET /users/me requires auth and returns the profile', async () => {
    await http.get('/users/me').expect(401);
    const res = await http.get('/users/me').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.data.email).toBe(owner.email);
  });

  it('POST /organizations creates a workspace with the caller as OWNER on FREE', async () => {
    const res = await http
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `Acme ${stamp}` })
      .expect(201);
    expect(res.body.data.role).toBe('OWNER');
    expect(res.body.data.plan).toBe('FREE');
    expect(res.body.data.memberCount).toBe(1);
    orgId = res.body.data.id;
  });

  it('org-scoped routes require X-Org-Id', async () => {
    const res = await http.get('/projects').set('Authorization', `Bearer ${accessToken}`).expect(400);
    expect(res.body.message).toContain('X-ORG-ID');
  });

  it('POST /projects creates a project', async () => {
    const res = await http
      .post('/projects')
      .set(authed())
      .send({ name: 'Website Relaunch', description: 'Marketing site', color: '#6366f1' })
      .expect(201);
    expect(res.body.data.taskCounts).toEqual({ total: 0, done: 0 });
    projectId = res.body.data.id;
  });

  it('POST /projects validates the body', async () => {
    const res = await http.post('/projects').set(authed()).send({ name: '', color: 'red' }).expect(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('POST /labels creates a label', async () => {
    const res = await http.post('/labels').set(authed()).send({ name: 'bug', color: '#ef4444' }).expect(201);
    labelId = res.body.data.id;
  });

  it('POST /projects/:id/tasks creates a task at position 0', async () => {
    const res = await http
      .post(`/projects/${projectId}/tasks`)
      .set(authed())
      .send({ title: 'Design hero', priority: 'HIGH', labelIds: [labelId] })
      .expect(201);
    expect(res.body.data.status).toBe('TODO');
    expect(res.body.data.position).toBe(0);
    expect(res.body.data.labels).toHaveLength(1);
    taskId = res.body.data.id;
  });

  it('GET /projects/:id/tasks paginates with meta', async () => {
    const res = await http.get(`/projects/${projectId}/tasks?page=1&pageSize=10`).set(authed()).expect(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
    expect(res.body.data[0].id).toBe(taskId);
  });

  it('POST /tasks/:id/status enforces transitions', async () => {
    await http.post(`/tasks/${taskId}/status`).set(authed()).send({ status: 'DONE' }).expect(422);
    const res = await http.post(`/tasks/${taskId}/status`).set(authed()).send({ status: 'IN_PROGRESS' }).expect(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
  });

  it('POST /tasks/reorder moves the task into IN_REVIEW', async () => {
    const res = await http
      .post('/tasks/reorder')
      .set(authed())
      .send({ taskId, toStatus: 'IN_REVIEW', toIndex: 0 })
      .expect(200);
    const moved = res.body.data.find((t: { id: string }) => t.id === taskId);
    expect(moved.status).toBe('IN_REVIEW');
    expect(moved.position).toBe(0);
  });

  it('POST /tasks/:id/comments adds a comment', async () => {
    const res = await http.post(`/tasks/${taskId}/comments`).set(authed()).send({ body: 'Nice work' }).expect(201);
    expect(res.body.data.author.email).toBeUndefined();
    expect(res.body.data.body).toBe('Nice work');
    const task = await http.get(`/tasks/${taskId}`).set(authed()).expect(200);
    expect(task.body.data.commentCount).toBe(1);
  });

  it('GET /activity lists recorded events', async () => {
    const res = await http.get('/activity?pageSize=50').set(authed()).expect(200);
    const actions = res.body.data.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['organization.created', 'project.created', 'task.created']));
  });

  it('GET /organizations/:id/stats aggregates', async () => {
    const res = await http.get(`/organizations/${orgId}/stats`).set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body.data.projects).toBe(1);
    expect(res.body.data.tasks.total).toBe(1);
    expect(res.body.data.tasksByStatus.IN_REVIEW).toBe(1);
  });

  it('invitation flow: invite -> preview -> accept as invitee', async () => {
    const invite = await http.post('/invitations').set(authed()).send({ email: invitee.email, role: 'MEMBER' }).expect(201);
    expect(invite.body.data.status).toBe('PENDING');

    const record = await prisma.invitation.findFirstOrThrow({ where: { organizationId: orgId, email: invitee.email } });
    // Tokens are hashed at rest; find the plain token by re-issuing through the mailer is not possible,
    // so we accept by creating the membership the same way the API does, then verify listing.
    const registered = await http.post('/auth/register').send(invitee).expect(201);
    const inviteeToken: string = registered.body.data.accessToken;

    await http.post('/invitations/token/not-a-real-token/accept').set('Authorization', `Bearer ${inviteeToken}`).expect(404);

    // Simulate the emailed link by deriving a token whose hash we control.
    const plainToken = `e2e-${stamp}-token-${'x'.repeat(24)}`;
    const { createHash } = await import('node:crypto');
    await prisma.invitation.update({
      where: { id: record.id },
      data: { tokenHash: createHash('sha256').update(plainToken).digest('hex') },
    });

    const preview = await http.get(`/invitations/token/${plainToken}`).expect(200);
    expect(preview.body.data.organization.id).toBe(orgId);

    const accepted = await http
      .post(`/invitations/token/${plainToken}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(200);
    expect(accepted.body.data.role).toBe('MEMBER');

    const members = await http.get('/members').set(authed()).expect(200);
    expect(members.body.data).toHaveLength(2);

    // A MEMBER cannot delete projects (ADMIN+).
    await http.delete(`/projects/${projectId}`).set(authed(inviteeToken)).expect(403);
  });

  it('refresh rotates tokens and detects reuse', async () => {
    const first = await http.post('/auth/refresh').send({ refreshToken }).expect(200);
    const rotated: string = first.body.data.refreshToken;
    expect(rotated).not.toBe(refreshToken);

    // Presenting the old token again is reuse -> whole family revoked.
    await http.post('/auth/refresh').send({ refreshToken }).expect(401);
    await http.post('/auth/refresh').send({ refreshToken: rotated }).expect(401);

    const login = await http.post('/auth/login').send({ email: owner.email, password: owner.password }).expect(200);
    accessToken = login.body.data.accessToken;
  });

  it('api keys: create once, authenticate with it, revoke', async () => {
    const created = await http.post('/api-keys').set(authed()).send({ name: 'CI' }).expect(201);
    const plainKey: string = created.body.data.plainKey;
    expect(plainKey.startsWith('lp_')).toBe(true);

    const viaKey = await http.get('/projects').set('Authorization', `Bearer ${plainKey}`).set('X-Org-Id', orgId).expect(200);
    expect(viaKey.body.data).toHaveLength(1);

    await http.delete(`/api-keys/${created.body.data.apiKey.id}`).set(authed()).expect(200);
    await http.get('/projects').set('Authorization', `Bearer ${plainKey}`).set('X-Org-Id', orgId).expect(401);
  });

  it('billing: overview, upgrade to PRO, signed webhook', async () => {
    const overview = await http.get('/billing').set(authed()).expect(200);
    expect(overview.body.data.plan.id).toBe('FREE');
    expect(overview.body.data.usage).toEqual({ projects: 1, members: 2 });

    const upgraded = await http.post('/billing/change-plan').set(authed()).send({ planId: 'PRO' }).expect(200);
    expect(upgraded.body.data.subscription.planId).toBe('PRO');
    const externalId: string = upgraded.body.data.subscription.externalId;

    const payload = JSON.stringify({ type: 'payment.failed', data: { externalId } });
    await http.post('/billing/webhook').set('Content-Type', 'application/json').send(payload).expect(401);
    await http
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('X-LaunchPad-Signature', signWebhookPayload(process.env.BILLING_WEBHOOK_SECRET as string, payload))
      .send(payload)
      .expect(200);

    const after = await http.get('/billing').set(authed()).expect(200);
    expect(after.body.data.subscription.status).toBe('PAST_DUE');
  });

  it('DELETE /organizations/:id removes everything (owner only)', async () => {
    await http.delete(`/organizations/${orgId}`).set('Authorization', `Bearer ${accessToken}`).expect(200);
    const remaining = await prisma.project.count({ where: { id: projectId } });
    expect(remaining).toBe(0);
  });
});
