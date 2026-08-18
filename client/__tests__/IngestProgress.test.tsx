import { render, screen } from '@testing-library/react';
import { IngestProgress } from '@/components/IngestProgress';
import type { IngestState } from '@/lib/useIngest';

describe('IngestProgress', () => {
  it('shows an error alert in the error phase', () => {
    const state: IngestState = { phase: 'error', error: 'Repository not found or is private.' };
    render(<IngestProgress state={state} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/repository not found/i);
  });

  it('shows the uploading step with an n/total counter', () => {
    const state: IngestState = {
      phase: 'polling',
      progress: { status: 'uploading', processed: 3, total: 10 },
    };
    render(<IngestProgress state={state} />);
    // "Uploading files" appears in both the status line and the step chip.
    expect(screen.getAllByText(/uploading files/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\(3\/10\)/)).toBeInTheDocument();
  });

  it('reflects the embedding step', () => {
    const state: IngestState = {
      phase: 'polling',
      progress: { status: 'embedding', processed: 40, total: 63 },
    };
    render(<IngestProgress state={state} />);
    expect(screen.getAllByText(/embedding & indexing/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\(40\/63\)/)).toBeInTheDocument();
  });

  it('shows a completed state in the done phase', () => {
    const state: IngestState = { phase: 'done', repoId: 'r1' };
    render(<IngestProgress state={state} />);
    // The status region should indicate completion (Done label present).
    expect(screen.getAllByText(/done/i).length).toBeGreaterThan(0);
  });
});
