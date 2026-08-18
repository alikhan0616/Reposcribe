import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '@/components/ChatInput';

describe('ChatInput', () => {
  it('submits on Enter and clears the input', async () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);
    const box = screen.getByLabelText(/chat message/i);

    await userEvent.type(box, 'where is auth?');
    await userEvent.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('where is auth?');
    expect(box).toHaveValue('');
  });

  it('does not submit on Shift+Enter (inserts newline instead)', async () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);
    const box = screen.getByLabelText(/chat message/i);

    await userEvent.type(box, 'line one');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables the send button and blocks Enter while streaming', async () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} disabled />);
    const box = screen.getByLabelText(/chat message/i);

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    // The textarea is disabled, so typing/Enter should not trigger a send.
    await userEvent.type(box, 'hello{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('ignores empty/whitespace-only submissions', async () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);
    await userEvent.type(screen.getByLabelText(/chat message/i), '   ');
    await userEvent.keyboard('{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });
});
