import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Message } from '@/components/Message';
import type { ChatMessage } from '@/lib/types';

// Avoid pulling ESM markdown deps into Jest — render content as plain text.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));
jest.mock('rehype-highlight', () => ({ __esModule: true, default: () => undefined }));

function makeMessage(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    trace: [],
    citations: [],
    streaming: false,
    ...over,
  };
}

describe('Message', () => {
  it('renders a user message bubble', () => {
    render(
      <Message
        message={makeMessage({ role: 'user', content: 'hello there' })}
        onCitationSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId('user-message')).toHaveTextContent('hello there');
  });

  it('renders agent content and its tool trace', () => {
    render(
      <Message
        message={makeMessage({
          content: 'Auth is in src/auth.ts',
          trace: [{ tool: 'search_codebase', input: {}, output: [], latencyMs: 12, ok: true }],
        })}
        onCitationSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId('agent-message')).toHaveTextContent('Auth is in src/auth.ts');
    expect(screen.getByText(/agent trace/i)).toBeInTheDocument();
  });

  it('renders citations as clickable buttons that emit a parsed citation', async () => {
    const onSelect = jest.fn();
    render(
      <Message
        message={makeMessage({ content: 'see below', citations: ['src/auth.ts:10-30'] })}
        onCitationSelect={onSelect}
      />,
    );

    const chip = screen.getByRole('button', { name: /src\/auth\.ts:10-30/ });
    expect(chip).toBeInTheDocument();

    await userEvent.click(chip);
    expect(onSelect).toHaveBeenCalledWith({
      raw: 'src/auth.ts:10-30',
      filepath: 'src/auth.ts',
      startLine: 10,
      endLine: 30,
    });
  });

  it('shows an error state instead of content when the agent errored', () => {
    render(
      <Message
        message={makeMessage({ error: 'LLM timeout' })}
        onCitationSelect={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('LLM timeout');
  });
});
