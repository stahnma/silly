// Caps how many of something run at once, in this process. Up to `max` run;
// up to `maxWaiting` more wait their turn; past that, run() rejects with a
// Busy error straight away rather than queueing without end.

export class Busy extends Error {}

export const createLimiter = ({ max, maxWaiting }) => {
  let running = 0;
  const waiting = [];

  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else running--;
  };

  return {
    async run(task) {
      if (running < max) {
        running++;
      } else if (waiting.length < maxWaiting) {
        // The slot is handed over by release(), so running stays the same.
        await new Promise(resolve => waiting.push(resolve));
      } else {
        throw new Busy('silly is busy; try again shortly');
      }
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
};
