import { newUuid, type SpaceSnapshot } from '@project/core';
import { readAggregate } from '../../src/aggregate-directory';

/**
 * One Space of the Aggregate directory at `directory`, read back through
 * `readAggregate`, the reader Import uses, so a directory a test reads here is
 * one Import would accept.
 *
 * `newUuid` rather than an injected generator because nothing here asserts on
 * a minted identity: the files a test reads back were written with every id
 * (ADR 0109).
 */
export const readAggregateSpace = async (
  directory: string,
  spaceId: string,
): Promise<SpaceSnapshot> => {
  const { spaces } = await readAggregate(directory, newUuid);
  const space = spaces.find(({ id }) => id === spaceId);
  if (space === undefined) throw new Error(`Aggregate ${directory} holds no Space ${spaceId}`);
  return space;
};
