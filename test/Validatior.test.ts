import { describe, expect, it } from 'bun:test';
import type { AppContext } from '../src/types';
import { createCrudValidationMiddleware } from '../src/Validatior';

const dbTables = {
  'public.messages': {
    id: { data_type: 'integer', is_nullable: 'NO' },
    body: { data_type: 'text', is_nullable: 'NO' },
  },
};

const createContext = (params: Record<string, string> = {}): AppContext => {
  const store: Record<string, unknown> = {};

  return {
    req: {
      param: () => params,
      queries: () => ({}),
      raw: {
        headers: new Headers(),
      },
      json: async () => ({}),
    },
    var: {
      dbTables,
    },
    env: {
      dbTables,
    },
    get: () => undefined,
    set: (key: string, value: unknown) => {
      store[key] = value;
    },
    status: (code: number) => {
      store.status = code;
    },
  } as unknown as AppContext;
};

describe('CRUD validation middleware', () => {
  it('does not require params.id for collection GET', async () => {
    const middleware = createCrudValidationMiddleware({ table: 'messages' });
    const c = createContext();
    let nextCalled = false;

    await middleware('get')(c, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('still validates params.id for item GET', async () => {
    const middleware = createCrudValidationMiddleware({ table: 'messages' });
    const c = createContext({ id: 'not-a-number' });
    let nextCalled = false;

    await middleware('get')(c, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
  });
});
