import React, { useState, useEffect, useCallback } from 'react';
import { BootSequence } from './components/BootSequence';
import { Terminal, type OutputLine } from './components/Terminal';
import { GameEngine } from './game/GameEngine';
import type { ColorScheme } from './types';
import './styles/terminal.css';

type GamePhase = 'boot' | 'playing';

export const ZorkGame: React.FC = () => {
  const [phase, setPhase] = useState<GamePhase>('boot');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [colorScheme, setColorScheme] = useState<ColorScheme>('green');
  const [crtEffect, setCrtEffect] = useState(true);
  const [gameEngine] = useState(() => new GameEngine());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Initialize game engine
    const init = async () => {
      try {
        const success = await gameEngine.initialize();
        if (!success) {
          setOutput([
            {
              text: 'WARNING: Gemini Nano AI not available. The game will use fallback responses.',
              type: 'error',
              timestamp: Date.now(),
            },
          ]);
        }
      } catch (error) {
        console.error('Zork: Error initializing game engine:', error);
        setOutput([
          {
            text: `ERROR: Failed to initialize game: ${error instanceof Error ? error.message : 'Unknown error'}`,
            type: 'error',
            timestamp: Date.now(),
          },
        ]);
      }
    };
    init();

    return () => {
      gameEngine.destroy();
    };
  }, [gameEngine]);

  const handleBootComplete = useCallback(() => {
    setPhase('playing');
    const location = gameEngine.getStateManager().getCurrentLocation();
    setOutput([
      {
        text: '═══════════════════════════════════════════════════════',
        type: 'system',
        timestamp: Date.now(),
      },
      {
        text: 'ZORK: INFINITE EDITION',
        type: 'system',
        timestamp: Date.now() + 1,
      },
      {
        text: 'A Text Adventure Powered by AI',
        type: 'system',
        timestamp: Date.now() + 2,
      },
      {
        text: '═══════════════════════════════════════════════════════',
        type: 'system',
        timestamp: Date.now() + 3,
      },
      {
        text: '',
        type: 'system',
        timestamp: Date.now() + 4,
      },
      {
        text: location?.description || 'You are in a mysterious place.',
        type: 'response',
        timestamp: Date.now() + 5,
      },
      {
        text: '',
        type: 'system',
        timestamp: Date.now() + 6,
      },
      {
        text: "Type 'help' for a list of commands.",
        type: 'system',
        timestamp: Date.now() + 7,
      },
    ]);
  }, [gameEngine]);

  const handleCommand = useCallback(
    async (command: string) => {
      // Add command to output
      setOutput((prev) => [
        ...prev,
        {
          text: command,
          type: 'command',
          timestamp: Date.now(),
        },
      ]);

      // Handle special commands
      if (command.toLowerCase() === 'quit' || command.toLowerCase() === 'exit') {
        setOutput((prev) => [
          ...prev,
          {
            text: 'Thanks for playing ZORK: INFINITE EDITION!',
            type: 'system',
            timestamp: Date.now(),
          },
        ]);
        setTimeout(() => {
          window.close();
        }, 1000);
        return;
      }

      if (command.toLowerCase() === 'clear' || command.toLowerCase() === 'cls') {
        setOutput([]);
        return;
      }

      if (command.toLowerCase() === 'settings') {
        setShowSettings(!showSettings);
        return;
      }

      // Process command with game engine
      setIsProcessing(true);
      try {
        const result = await gameEngine.processCommand(command);

        setOutput((prev) => [
          ...prev,
          {
            text: result.message,
            type: result.success ? 'response' : 'error',
            timestamp: Date.now(),
          },
        ]);

        // Check for achievements
        const state = gameEngine.getStateManager().getState();
        if (state.history.visitedLocations.length === 10 && !state.meta.achievements.includes('explorer')) {
          gameEngine.getStateManager().addAchievement('explorer');
          setOutput((prev) => [
            ...prev,
            {
              text: '🏆 Achievement Unlocked: Explorer - Visit 10 locations',
              type: 'system',
              timestamp: Date.now() + 1,
            },
          ]);
        }
      } catch (error) {
        setOutput((prev) => [
          ...prev,
          {
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            type: 'error',
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    },
    [gameEngine, showSettings]
  );

  const handleColorSchemeChange = (scheme: ColorScheme) => {
    setColorScheme(scheme);
  };

  const handleCrtToggle = () => {
    setCrtEffect(!crtEffect);
  };

  const containerClass = `zork-container scheme-${colorScheme} ${crtEffect ? 'crt-effect' : ''}`;

  return (
    <div className={containerClass}>
      {phase === 'boot' && <BootSequence onComplete={handleBootComplete} />}

      {phase === 'playing' && (
        <>
          <Terminal output={output} onCommand={handleCommand} isProcessing={isProcessing} colorScheme={colorScheme} />

          {showSettings && (
            <div className="settings-panel">
              <h3>Settings</h3>
              <div>
                <label>Color Scheme:</label>
                <div>
                  <button onClick={() => handleColorSchemeChange('green')}>Green</button>
                  <button onClick={() => handleColorSchemeChange('amber')}>Amber</button>
                  <button onClick={() => handleColorSchemeChange('white')}>White</button>
                  <button onClick={() => handleColorSchemeChange('blue')}>Blue</button>
                  <button onClick={() => handleColorSchemeChange('apple')}>Apple II</button>
                </div>
              </div>
              <div>
                <label>
                  <input type="checkbox" checked={crtEffect} onChange={handleCrtToggle} />
                  CRT Effect
                </label>
              </div>
              <button onClick={() => setShowSettings(false)}>Close</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
