import { GITHUB_PUSH_EVENT } from '../fixtures';

jest.mock('@actions/core');
jest.mock('@actions/github', () => ({
  context: { repo: { owner: 'RentTheRunway', repo: 'github-action-slack-notify-build' } },
}));
jest.mock('@slack/web-api');

const core = require('@actions/core');
const github = require('@actions/github');
const { WebClient } = require('@slack/web-api');

// index.js runs on require, so load it fresh per test and wait for its async IIFE to settle.
async function runAction(inputs) {
  core.getInput.mockImplementation(name => inputs[name] || '');
  jest.isolateModules(() => {
    require('../index');
  });
  await new Promise(resolve => setImmediate(resolve));
}

describe('action', () => {
  let slack;

  beforeEach(() => {
    jest.clearAllMocks();
    // utils.js holds a reference to this context object, so mutate it rather than replace it.
    Object.assign(github.context, GITHUB_PUSH_EVENT.context);
    slack = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ts: '111.222' }),
        update: jest.fn().mockResolvedValue({ ts: '111.222' }),
      },
      paginate: jest.fn(),
    };
    WebClient.mockImplementation(() => slack);
  });

  it('creates the Slack client with the token input', async () => {
    await runAction({ token: 'xoxb-test', channel_id: 'C123', status: 'STARTED', color: 'good' });

    expect(WebClient).toHaveBeenCalledWith('xoxb-test');
  });

  it('fails when neither channel nor channel_id is given', async () => {
    await runAction({ status: 'STARTED', color: 'good' });

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining(`either a 'channel' or a 'channel_id'`));
    expect(slack.chat.postMessage).not.toHaveBeenCalled();
  });

  describe('with channel_id', () => {
    it('posts a new message and outputs its id', async () => {
      await runAction({ channel_id: 'C123', status: 'STARTED', color: 'good' });

      expect(slack.chat.postMessage).toHaveBeenCalledTimes(1);
      expect(slack.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C123', attachments: expect.any(Array) })
      );
      expect(slack.chat.postMessage.mock.calls[0][0]).not.toHaveProperty('ts');
      expect(slack.chat.update).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('message_id', '111.222');
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('skips the channel lookup', async () => {
      await runAction({ channel_id: 'C123', status: 'STARTED', color: 'good' });

      expect(slack.paginate).not.toHaveBeenCalled();
    });

    it('updates the existing message when message_id is given', async () => {
      await runAction({ channel_id: 'C123', message_id: '999.000', status: 'SUCCESS', color: 'good' });

      expect(slack.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C123', ts: '999.000', attachments: expect.any(Array) })
      );
      expect(slack.chat.postMessage).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('message_id', '111.222');
    });

    it('passes status and color through to the attachment', async () => {
      await runAction({ channel_id: 'C123', status: 'FAILED', color: 'danger' });

      const [attachment] = slack.chat.postMessage.mock.calls[0][0].attachments;
      expect(attachment.color).toBe('danger');
      expect(attachment.fields.find(f => f.title === 'Status').value).toBe('FAILED');
    });
  });

  describe('with channel name', () => {
    function pages(...channelPages) {
      return {
        async *[Symbol.asyncIterator]() {
          for (const channels of channelPages) {
            yield { channels };
          }
        },
      };
    }

    it('looks up the id, stripping a leading #', async () => {
      slack.paginate.mockReturnValue(
        pages([
          { name: 'other', id: 'C000' },
          { name: 'alerts', id: 'C777' },
        ])
      );

      await runAction({ channel: '#alerts', status: 'STARTED', color: 'good' });

      expect(slack.paginate).toHaveBeenCalledWith('conversations.list', expect.any(Object));
      expect(slack.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: 'C777' }));
    });

    it('finds a channel on a later page', async () => {
      slack.paginate.mockReturnValue(pages([{ name: 'a', id: 'C1' }], [{ name: 'alerts', id: 'C2' }]));

      await runAction({ channel: 'alerts', status: 'STARTED', color: 'good' });

      expect(slack.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: 'C2' }));
    });

    it('prefers channel_id over a channel name', async () => {
      await runAction({ channel: 'alerts', channel_id: 'C123', status: 'STARTED', color: 'good' });

      expect(slack.paginate).not.toHaveBeenCalled();
      expect(slack.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ channel: 'C123' }));
    });

    it('fails when the channel does not exist', async () => {
      slack.paginate.mockReturnValue(pages([{ name: 'other', id: 'C000' }]));

      await runAction({ channel: 'missing', status: 'STARTED', color: 'good' });

      expect(core.setFailed).toHaveBeenCalledWith('Slack channel missing could not be found.');
      expect(slack.chat.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    it('reports a Slack API error through setFailed', async () => {
      slack.chat.postMessage.mockRejectedValue(new Error('An API error occurred: channel_not_found'));

      await runAction({ channel_id: 'C123', status: 'STARTED', color: 'good' });

      expect(core.setFailed).toHaveBeenCalledWith('An API error occurred: channel_not_found');
      expect(core.setOutput).not.toHaveBeenCalled();
    });
  });
});
