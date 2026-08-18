import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecentRepos } from '@/components/RecentRepos';
import type { UserRepoEntry } from '@/lib/types';

const repos: UserRepoEntry[] = [
  {
    repoId: 'r1',
    repoUrl: 'https://github.com/acme/widget',
    name: 'acme/widget',
    indexedAt: '2026-01-01T00:00:00.000Z',
    fileCount: 3,
    chunkCount: 42,
  },
];

describe('RecentRepos', () => {
  it('renders nothing when there are no repos', () => {
    const { container } = render(
      <RecentRepos repos={[]} onOpen={jest.fn()} onForget={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a repo with its counts', () => {
    render(<RecentRepos repos={repos} onOpen={jest.fn()} onForget={jest.fn()} />);
    expect(screen.getByText('acme/widget')).toBeInTheDocument();
    expect(screen.getByText(/3 files · 42 chunks/)).toBeInTheDocument();
  });

  it('opens a repo without re-ingesting when clicked', async () => {
    const onOpen = jest.fn();
    render(<RecentRepos repos={repos} onOpen={onOpen} onForget={jest.fn()} />);
    await userEvent.click(screen.getByText('acme/widget'));
    expect(onOpen).toHaveBeenCalledWith('r1');
  });

  it('forgets a repo via its Forget button', async () => {
    const onForget = jest.fn();
    render(<RecentRepos repos={repos} onOpen={jest.fn()} onForget={onForget} />);
    await userEvent.click(screen.getByRole('button', { name: /forget acme\/widget/i }));
    expect(onForget).toHaveBeenCalledWith('r1');
  });
});
