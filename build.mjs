import { rollup } from 'rollup';
import config from './rollup.config.js';

async function build() {
  const configs = Array.isArray(config) ? config : [config];

  for (const cfg of configs) {
    const bundle = await rollup(cfg);
    const outputs = Array.isArray(cfg.output) ? cfg.output : [cfg.output];
    for (const output of outputs) {
      await bundle.write(output);
    }
    await bundle.close();
  }
}

build()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
