import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_PAGE_SIZE, paginate, PaginationQueryDto, toSkipTake } from './pagination.dto';

describe('pagination', () => {
  it('applies defaults', () => {
    expect(toSkipTake({})).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });

  it('computes skip/take for later pages', () => {
    expect(toSkipTake({ page: 3, pageSize: 15 })).toEqual({ skip: 30, take: 15, page: 3, pageSize: 15 });
  });

  it('clamps out-of-range values', () => {
    expect(toSkipTake({ page: 0, pageSize: 999 })).toEqual({ skip: 0, take: MAX_PAGE_SIZE, page: 1, pageSize: MAX_PAGE_SIZE });
    expect(toSkipTake({ page: -5, pageSize: 0 })).toEqual({ skip: 0, take: 1, page: 1, pageSize: 1 });
  });

  it('builds the envelope with totalPages', () => {
    expect(paginate(['a', 'b'], 41, { page: 2, pageSize: 20 })).toEqual({
      data: ['a', 'b'],
      meta: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
    });
    expect(paginate([], 0, {}).meta.totalPages).toBe(0);
  });

  it('DTO validates and coerces query strings', async () => {
    const ok = plainToInstance(PaginationQueryDto, { page: '2', pageSize: '50' });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.page).toBe(2);
    expect(ok.pageSize).toBe(50);

    const tooBig = plainToInstance(PaginationQueryDto, { pageSize: '500' });
    expect((await validate(tooBig)).map((e) => e.property)).toEqual(['pageSize']);

    const fractional = plainToInstance(PaginationQueryDto, { page: '1.5' });
    expect((await validate(fractional)).map((e) => e.property)).toEqual(['page']);
  });
});
