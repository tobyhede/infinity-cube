import type { ReactNode } from 'react';
import type { MapEmbedRequest } from '@project/ui';
import { CanvasMapEmbed } from './CanvasMapEmbed';
import { PresentedMapEmbed } from './PresentedMapEmbed';

/** The Map embedding as the canvas draws it, for `HostMapProvider`. */
export const drawCanvasMapEmbed = (request: MapEmbedRequest): ReactNode => (
  <CanvasMapEmbed request={request} />
);

/** The Map embedding as the Stage draws it, for `HostMapProvider`. */
export const drawPresentedMapEmbed = (request: MapEmbedRequest): ReactNode => (
  <PresentedMapEmbed request={request} />
);
