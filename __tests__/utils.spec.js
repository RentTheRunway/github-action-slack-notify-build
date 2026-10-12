import { formatChannelName, buildSlackAttachments } from '../src/utils';
import { GITHUB_PUSH_EVENT, GITHUB_PR_EVENT } from '../fixtures';

describe('Utils', () => {
  const originalRepository = process.env.GITHUB_REPOSITORY;

  beforeAll(() => {
    // context.repo reads this env var; pin it so tests do not depend on the runner or shell.
    process.env.GITHUB_REPOSITORY = 'RentTheRunway/github-action-slack-notify-build';
  });

  afterAll(() => {
    if (originalRepository === undefined) {
      delete process.env.GITHUB_REPOSITORY;
    } else {
      process.env.GITHUB_REPOSITORY = originalRepository;
    }
  });

  describe('formatChannelName', () => {
    it('strips #', () => {
      expect(formatChannelName('#app-notifications')).toBe('app-notifications');
    });

    it('strips @', () => {
      expect(formatChannelName('@app.buddy')).toBe('app.buddy');
    });

    it('leaves a plain channel name unchanged', () => {
      expect(formatChannelName('plat-eng-notifications')).toBe('plat-eng-notifications');
    });

    it('strips every # and @, not just the first', () => {
      expect(formatChannelName('##a@@b')).toBe('ab');
    });
  });

  describe('buildSlackAttachments', () => {
    it('passes color', () => {
      const attachments = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

      expect(attachments[0].color).toBe('good');
    });

    it('shows status', () => {
      const attachments = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

      expect(attachments[0].fields.find(a => a.title === 'Status')).toEqual({
        title: 'Status',
        value: 'STARTED',
        short: true,
      });
    });

    it('links to the repository in the footer', () => {
      const [attachment] = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

      expect(attachment.footer).toBe(
        '<https://github.com/RentTheRunway/github-action-slack-notify-build | RentTheRunway/github-action-slack-notify-build>'
      );
    });

    it('sets ts to the current time in whole seconds', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-02T03:04:05.678Z'));
      try {
        const [attachment] = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

        expect(attachment.ts).toBe(Math.floor(new Date('2026-01-02T03:04:05.678Z').getTime() / 1000));
      } finally {
        jest.useRealTimers();
      }
    });

    it('lists Action, Status, reference link, then Event', () => {
      const [attachment] = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

      expect(attachment.fields.map(f => f.title)).toEqual(['Action', 'Status', 'Branch', 'Event']);
    });

    describe('for push events', () => {
      it('shows the event name', () => {
        const [attachment] = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

        expect(attachment.fields.find(a => a.title === 'Event').value).toBe('push');
      });

      it('links to the action workflow', () => {
        const attachments = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

        expect(attachments[0].fields.find(a => a.title === 'Action')).toEqual({
          title: 'Action',
          value: `<https://github.com/RentTheRunway/github-action-slack-notify-build/commit/abc123/checks | CI>`,
          short: true,
        });
      });

      it('shows the event name', () => {
        const attachments = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

        expect(attachments[0].fields.find(a => a.title === 'Event')).toEqual({
          title: 'Event',
          value: 'push',
          short: true,
        });
      });

      it('links to the branch', () => {
        const attachments = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PUSH_EVENT });

        expect(attachments[0].fields.find(a => a.title === 'Branch')).toEqual({
          title: 'Branch',
          value: `<https://github.com/RentTheRunway/github-action-slack-notify-build/commit/abc123 | my-branch>`,
          short: true,
        });
      });
    });

    describe('for PR events', () => {
      it('shows a Pull Request field instead of Branch', () => {
        const [attachment] = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PR_EVENT });

        expect(attachment.fields.map(f => f.title)).toEqual(['Action', 'Status', 'Pull Request', 'Event']);
      });

      it('links to the action workflow', () => {
        const attachments = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PR_EVENT });

        expect(attachments[0].fields.find(a => a.title === 'Action')).toEqual({
          title: 'Action',
          value: `<https://github.com/RentTheRunway/github-action-slack-notify-build/commit/xyz678/checks | CI>`,
          short: true,
        });
      });

      it('shows the event name', () => {
        const attachments = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PR_EVENT });

        expect(attachments[0].fields.find(a => a.title === 'Event')).toEqual({
          title: 'Event',
          value: 'pull_request',
          short: true,
        });
      });

      it('links to the PR', () => {
        const attachments = buildSlackAttachments({ status: 'STARTED', color: 'good', github: GITHUB_PR_EVENT });

        expect(attachments[0].fields.find(a => a.title === 'Pull Request')).toEqual({
          title: 'Pull Request',
          value: `<https://github.com/RentTheRunway/github-action-slack-notify-build/pulls/1 | This is a PR>`,
          short: true,
        });
      });
    });
  });
});
