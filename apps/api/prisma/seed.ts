import { PrismaClient, TaskPriority, TaskStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PLANS = [
  {
    id: 'FREE' as const,
    name: 'Free',
    priceMonthly: 0,
    maxProjects: 3,
    maxMembers: 5,
    features: ['Up to 3 projects', 'Up to 5 members', 'Kanban & list views', 'Community support'],
  },
  {
    id: 'PRO' as const,
    name: 'Pro',
    priceMonthly: 1900,
    maxProjects: 25,
    maxMembers: 25,
    features: ['Up to 25 projects', 'Up to 25 members', 'API keys', 'Activity history', 'Priority support'],
  },
  {
    id: 'ENTERPRISE' as const,
    name: 'Enterprise',
    priceMonthly: 9900,
    maxProjects: 1000,
    maxMembers: 1000,
    features: ['Unlimited projects', 'Unlimited members', 'API keys', 'SSO-ready', 'Dedicated support'],
  },
];

async function seedPlans(): Promise<void> {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        maxProjects: plan.maxProjects,
        maxMembers: plan.maxMembers,
        features: plan.features,
      },
      create: plan,
    });
  }
  console.log(`Seeded ${PLANS.length} plans`);
}

async function seedDemo(): Promise<void> {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@launchpad.dev' },
    update: {},
    create: { email: 'admin@launchpad.dev', name: 'Ada Admin', passwordHash },
  });
  const member = await prisma.user.upsert({
    where: { email: 'member@launchpad.dev' },
    update: {},
    create: { email: 'member@launchpad.dev', name: 'Max Member', passwordHash },
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme Inc.',
      slug: 'acme',
      ownerId: admin.id,
      memberships: {
        create: [
          { userId: admin.id, role: 'OWNER' },
          { userId: member.id, role: 'MEMBER' },
        ],
      },
      subscription: {
        create: {
          planId: 'PRO',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
  });

  const labelNames: Array<{ name: string; color: string }> = [
    { name: 'bug', color: '#ef4444' },
    { name: 'feature', color: '#22c55e' },
    { name: 'design', color: '#a855f7' },
  ];
  const labels: Array<{ id: string }> = [];
  for (const label of labelNames) {
    labels.push(
      await prisma.label.upsert({
        where: { organizationId_name: { organizationId: org.id, name: label.name } },
        update: { color: label.color },
        create: { ...label, organizationId: org.id },
      }),
    );
  }

  const existingProject = await prisma.project.findFirst({
    where: { organizationId: org.id, name: 'Website Relaunch' },
  });
  if (existingProject) {
    console.log('Demo project already exists, skipping tasks');
    return;
  }

  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: 'Website Relaunch',
      description: 'Redesign and relaunch the marketing site.',
      color: '#6366f1',
    },
  });

  const tasks: Array<{
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    labelIdx: number[];
    assignee?: string;
    dueInDays?: number;
  }> = [
    { title: 'Audit current site analytics', status: 'DONE', priority: 'MEDIUM', labelIdx: [], assignee: admin.id },
    { title: 'Define new information architecture', status: 'DONE', priority: 'HIGH', labelIdx: [2], assignee: admin.id },
    { title: 'Design homepage hero', status: 'IN_REVIEW', priority: 'HIGH', labelIdx: [2], assignee: member.id, dueInDays: 3 },
    { title: 'Implement pricing page', status: 'IN_PROGRESS', priority: 'URGENT', labelIdx: [1], assignee: member.id, dueInDays: 5 },
    { title: 'Fix mobile nav overflow', status: 'TODO', priority: 'HIGH', labelIdx: [0], dueInDays: 2 },
    { title: 'Write launch blog post', status: 'TODO', priority: 'LOW', labelIdx: [1], dueInDays: 14 },
    { title: 'Set up A/B testing framework', status: 'BACKLOG', priority: 'MEDIUM', labelIdx: [1] },
    { title: 'Migrate legacy redirects', status: 'BACKLOG', priority: 'LOW', labelIdx: [] },
  ];

  const positions = new Map<TaskStatus, number>();
  for (const task of tasks) {
    const position = positions.get(task.status) ?? 0;
    positions.set(task.status, position + 1);
    const created = await prisma.task.create({
      data: {
        projectId: project.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        position,
        creatorId: admin.id,
        assigneeId: task.assignee ?? null,
        dueDate: task.dueInDays ? new Date(Date.now() + task.dueInDays * 24 * 60 * 60 * 1000) : null,
        labels: { create: task.labelIdx.map((i) => ({ labelId: labels[i].id })) },
      },
    });
    await prisma.activity.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        actorId: admin.id,
        entityType: 'task',
        entityId: created.id,
        action: 'task.created',
        metadata: { title: created.title },
      },
    });
  }

  await prisma.comment.create({
    data: {
      taskId: (await prisma.task.findFirstOrThrow({ where: { projectId: project.id, status: 'IN_PROGRESS' } })).id,
      authorId: admin.id,
      body: 'Remember to include the annual billing toggle.',
    },
  });

  console.log('Seeded demo organization "Acme Inc." (admin@launchpad.dev / Password123!)');
}

async function main(): Promise<void> {
  await seedPlans();
  await seedDemo();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
