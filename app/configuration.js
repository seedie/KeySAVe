import { registerFormattingPlugin,
  addFormattingOption,
  overwriteSinglePluginOption,
  selectFormattingOption,
  changeFormatLanguage
} from './actions/format';
import options from './components/formatters';
import * as fs from 'fs-extra';
import { version } from '../package.json';
import { remote } from 'electron';
const { getPath } = remote.require('electron').app;

function parseConfig(store, config) {
  if (!config.version) {
    for (const option of config.formattingOptions) {
      store.dispatch(addFormattingOption(option.name, 'Handlebars', {
        header: option.header,
        format: option.format,
      }));
    }
  } else {
    for (const option of config.formattingOptions) {
      if (option.singleInstance) {
        store.dispatch(overwriteSinglePluginOption(option));
      } else {
        store.dispatch(addFormattingOption(option.name, option.plugin, option.format));
      }
    }
  }
  if (config.selectedFormatIndex !== undefined) store.dispatch(selectFormattingOption(config.selectedFormatIndex));
  if (config.language !== undefined) store.dispatch(changeFormatLanguage(config.language));
}

function serializeConfig(store) {
  const { format } = store.getState();
  const formattingOptions = format.formattingOptions
    .valueSeq()
    .filter(e => !e.default)
    .map(({ name, plugin: { name: plugin, multipleInstances }, format }) => ({
      name, plugin, format, singleInstance: !multipleInstances
    }))
    .toArray();
  return {
    formattingOptions,
    language: format.language,
    selectedFormatIndex: format.currentIndex,
    version
  };
}

export default async function loadConfig(store) {
  for (const option of options) {
    store.dispatch(registerFormattingPlugin(option));
  }
  try {
    const file = await fs.readFileAsync(getPath('userData') + '/config.json', 'utf-8');
    parseConfig(store, JSON.parse(file));
  } catch (e) {
    try {
      const file = await fs.readFileAsync(getPath('documents') + '/KeySAVe/config.json', 'utf-8');
      parseConfig(store, JSON.parse(file));
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('beforeunload', async () => {
    const config = serializeConfig(store);
    await fs.writeFileAsync(getPath('userData') + '/config.json', JSON.stringify(config, null, '    '), 'utf-8');
  }, false);
}
