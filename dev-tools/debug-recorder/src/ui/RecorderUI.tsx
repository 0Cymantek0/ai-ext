import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import type { SessionController } from '../session-controller.js';
import type { BridgeServer } from '../bridge-server.js';

interface RecorderUIProps {
  controller: SessionController;
  bridgeServer: BridgeServer | null;
  port?: number;
}

export const RecorderUI: React.FC<RecorderUIProps> = ({ controller, bridgeServer, port }) => {
  const { exit } = useApp();
  const [state, setState] = useState(controller.getState());
  const [uptime, setUptime] = useState(0);
  const [sessionId, setSessionId] = useState(controller.getSessionId());
  const [connectedClients, setConnectedClients] = useState(0);
  const [eventsReceived, setEventsReceived] = useState(0);

  useEffect(() => {
    const onStateChange = () => {
      setState(controller.getState());
      setSessionId(controller.getSessionId());
    };

    controller.on('stateChange', onStateChange);

    return () => {
      controller.off('stateChange', onStateChange);
    };
  }, [controller]);

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(controller.getUptime());

      if (bridgeServer) {
        const status = bridgeServer.getStatus();
        setConnectedClients(status.connectedClients);
        setEventsReceived(status.totalEventsReceived);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [controller, bridgeServer]);

  useEffect(() => {
    if (state === 'stopped') {
      setTimeout(() => exit(), 500);
    }
  }, [state, exit]);

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getStateColor = (state: string): string => {
    switch (state) {
      case 'recording':
        return 'green';
      case 'paused':
        return 'yellow';
      case 'stopped':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStateIndicator = (state: string): string => {
    switch (state) {
      case 'recording':
        return '🔴';
      case 'paused':
        return '⏸️ ';
      case 'stopped':
        return '⏹️ ';
      default:
        return '⚪';
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold underline>
          AI Pocket Debug Recorder
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
        <Box marginBottom={1}>
          <Text bold>Session Status</Text>
        </Box>

        <Box>
          <Text>State: </Text>
          <Text color={getStateColor(state)} bold>
            {getStateIndicator(state)} {state.toUpperCase()}
          </Text>
        </Box>

        {sessionId && (
          <Box>
            <Text>Session ID: </Text>
            <Text color="cyan">{sessionId}</Text>
          </Box>
        )}

        <Box>
          <Text>Uptime: </Text>
          <Text color="magenta">{formatUptime(uptime)}</Text>
        </Box>
      </Box>

      {bridgeServer && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="blue"
          padding={1}
          marginTop={1}
        >
          <Box marginBottom={1}>
            <Text bold>WebSocket Bridge</Text>
          </Box>

          <Box>
            <Text>Port: </Text>
            <Text color="blue">{port}</Text>
          </Box>

          <Box>
            <Text>Connected Contexts: </Text>
            <Text color={connectedClients > 0 ? 'green' : 'gray'}>{connectedClients}</Text>
          </Box>

          <Box>
            <Text>Events Received: </Text>
            <Text color="yellow">{eventsReceived}</Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Commands:</Text>
        {state === 'recording' && (
          <>
            <Text dimColor> • Press Ctrl+P to pause recording</Text>
            <Text dimColor> • Press Ctrl+C to stop and exit</Text>
          </>
        )}
        {state === 'paused' && (
          <>
            <Text dimColor> • Press Ctrl+R to resume recording</Text>
            <Text dimColor> • Press Ctrl+C to stop and exit</Text>
          </>
        )}
      </Box>
    </Box>
  );
};
