/**
 * Replacing an Image Resource's picture, over the production application (ADR
 * 0106, ADR 0142): Replace on the Resource's rail opens the picker in the
 * press, and the chosen picture, or one dropped on the Resource, is stored and
 * named in one Edit while every other Edit and navigation waits.
 *
 * `iframed` is written out because Ladle reads each `meta` statically.
 */
import type { Story } from '@ladle/react';
import { ReplaceImageFixture } from '../support/ReplaceImageFixture';

export default { title: 'Space/Replace Image' };

/** An Image Resource, and one whose picture does not load. */
export const Default: Story = () => <ReplaceImageFixture />;
Default.meta = { iframed: true };
