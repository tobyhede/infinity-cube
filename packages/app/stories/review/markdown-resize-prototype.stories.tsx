import type { Story } from '@ladle/react';
import '../support/inventory.css';
import { EditingComparison } from './MarkdownEditingComparison';
import './markdown-resize-prototype.css';

export default { title: 'Review/Markdown prototype' };

const noteSource = `## Walking the ridge

Leave the track at the saddle. From here the ridge is wide enough to walk two abreast, and the first cairn is visible against the sky.

At the second cairn, turn east. The creek below is easier to hear than to see. Follow its sound until the path meets the old timber bridge.

### The return route

Cross the bridge and follow the marked trail through the trees. The last clearing gives you a view back to both cairns.`;
export const EditModes: Story = () => <EditingComparison initial={noteSource} />;
