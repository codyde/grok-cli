import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

const { createElement: h } = React;

// Available commands
const COMMANDS = [
  {
    name: 'debug',
    description: 'Open debug console to view logs and API calls',
    label: '/debug - Open debug console',
    value: 'debug'
  },
  {
    name: 'clear',
    description: 'Reset the conversation history',
    label: '/clear - Reset conversation',
    value: 'clear'
  },
  {
    name: 'save',
    description: 'Save the current conversation to a JSON file',
    label: '/save - Save conversation',
    value: 'save'
  },
  // Add more commands here in the future
];

// Command Search Component
const CommandSelector = ({ query, onSelect }) => {
  // Filter commands based on query
  const filteredCommands = COMMANDS.filter(command => 
    command.name.toLowerCase().includes(query.toLowerCase())
  );

  const items = filteredCommands.map(command => ({
    label: command.label,
    value: command.value,
    description: command.description
  }));

  return h(Box, { 
    borderStyle: 'single', 
    borderColor: 'magenta', 
    padding: 1, 
    flexDirection: 'column' 
  },
    h(Text, { color: 'magenta' }, `Commands matching: /${query}`),
    items.length > 0 
      ? h(SelectInput, { 
          items, 
          onSelect: (item) => onSelect(item.value)
        })
      : h(Text, { color: 'yellow' }, 'No commands found')
  );
};

export default CommandSelector;