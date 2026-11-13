import {
  createBrowserLocation,
  type BrowserLocation,
  type HistoryApi,
} from '../src/browser-location';
import type { DestinationOpening } from '../src/destination-opening';
import type { OpenSpace } from '../src/open-spaces';
import { mountSpaceApp, type SpaceAppRenderer } from '../src/SpaceApp';
import { createElement } from 'react';
import { PluginAssetsProvider } from '@project/ui';
import { recordingHistory } from './browser-history';
import { TEST_ASSETS } from './markdown-texts';

/**
 * Mount one Space the way Open Spaces opens one: the session's browser location
 * follows this composition, and the app is built over the location rather than
 * over a browser.
 *
 * The location is answered so a test that is about the browser can assert on it;
 * the many that are not simply ignore it and get a recording history at `/`.
 * The app is drawn inside {@link TEST_ASSETS}, as a composition supplies its
 * asset store, so a Markdown Resource reads the text a test named.
 */
export const mountSpace = (
  opened: OpenSpace,
  render: SpaceAppRenderer,
  opening?: DestinationOpening,
  history: HistoryApi = recordingHistory(),
): BrowserLocation => {
  // One Space and no open set around it, whose plugin gate is the one that
  // publishes ADR 0126's hold; a test of the hold opens the Space through it.
  const browserLocation = createBrowserLocation(history, {
    isNavigationHeld: () => false,
  });
  browserLocation.follow(opened.app);
  mountSpaceApp(
    opened,
    browserLocation,
    (app) => render(createElement(PluginAssetsProvider, { value: TEST_ASSETS }, app)),
    opening,
  );
  return browserLocation;
};
