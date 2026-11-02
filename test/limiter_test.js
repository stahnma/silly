// The concurrency limiter photo generators run under.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createLimiter, Busy } from '../src/limiter.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => (resolve = r));
  return { promise, resolve };
};

describe('limiter', () => {
  it('runs up to max at once, queues up to maxWaiting, and refuses the rest', async () => {
    const limiter = createLimiter({ max: 2, maxWaiting: 1 });
    const gates = [deferred(), deferred(), deferred()];
    let running = 0;
    let most = 0;
    const task = gate => async () => {
      running++;
      most = Math.max(most, running);
      await gate.promise;
      running--;
      return 'done';
    };

    const runs = gates.map(g => limiter.run(task(g)));
    await assert.rejects(limiter.run(task(deferred())), Busy);
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(running, 2);

    gates.forEach(g => g.resolve());
    assert.deepStrictEqual(await Promise.all(runs), ['done', 'done', 'done']);
    assert.strictEqual(most, 2);
  });

  it('frees the slot when a task fails', async () => {
    const limiter = createLimiter({ max: 1, maxWaiting: 0 });
    await assert.rejects(
      limiter.run(async () => {
        throw new Error('boom');
      }),
      /boom/
    );
    assert.strictEqual(await limiter.run(async () => 'ok'), 'ok');
  });
});
