import { createHash } from 'node:crypto';
import type { AssetRef } from '@project/core';

/**
 * The reference a Markdown Resource names `text` by: its SHA-256 in base64url
 * (ADR 0142). Intake never reads the text, so these tests only name it.
 */
export const textRef = (text: string): AssetRef =>
  `/assets/${createHash('sha256').update(text).digest('base64url')}`;
