const promisify = require('util').promisify;
const phantom = require('node-phantom-simple');
const phantomPath = require('phantomjs-prebuilt').path;
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');

const randomFile = (suffix = '') =>
  path.join(os.tmpdir(), crypto.randomBytes(48).toString('hex').concat(suffix));

const escape = s => s.replace(/'/g, '\\\'').replace(/`/g, '\\`').replace(/([\r?\n])/g, `\\$1`);

const CONTAINERS = ['footer', 'header'];
const ATTRIBUTES = ['height'];

const dpi = 72;
const dpcm = dpi / 2.54;
const wcm = 21;
const hcm = 29.7;

const viewportSize = {
  width: Math.round(wcm * dpcm),
  height: Math.round(hcm * dpcm)
};

module.exports = async (html, options) => {
  const tmpfile = options.outputFile || randomFile('.pdf');
  const browser = await promisify(phantom.create)({ path: phantomPath });
  const page = await promisify(browser.createPage)();

  options = Object.assign({
    color: '#454545',
    font: `'SF Pro Text', 'Arial Unicode MS', sans-serif`,
    footer: ''
  }, options);

  const paper = {
    width: `${viewportSize.width}px`,
    height: `${viewportSize.height}px`,
    orientation: 'portrait',
    margin: '0.75cm'
  };

  CONTAINERS.forEach(name => {
    const container = {
      contents: options[name],
      height: '0.25cm'
    };

    const rx = new RegExp(`<pdf${name}([^>]*?)>([\\S\\s]*)</pdf${name}>`, 'g');

    if (rx.test(html)) {
      container.attributes = RegExp.$1;
      container.contents = RegExp.$2;

      html = html.replace(rx, '');
    }

    if (!container.contents) {
      return;
    }

    ATTRIBUTES.forEach(attr => {
      if (new RegExp(`${attr}="(.*?)"`).test(container.attributes)) {
        container[attr] = RegExp.$1;
      }
    });

    container.contents = escape(`<style>
      * { font-family: ${options.font}; color: ${options.color}; font-size: 8px; }
    </style>${container.contents}`)
      .replace(/#PAGE#/g, `' + page + '`)
      .replace(/#TOTAL#/g, `' + total + '`);

    container.contents = `function (page, total) { return '${container.contents}'; }`;
    container.contents = eval(`container.contents._ = ${container.contents}`); //eslint-disable-line

    paper[name] = container;
  });

  page.set = promisify(page.set);
  page.render = promisify(page.render);

  await page.set('viewportSize', Object.assign({}, viewportSize, options.viewportSize));
  await page.set('paperSize', Object.assign({}, paper, options.paperSize));
  await page.set('settings.dpi', dpi);

  if (options.statics) {
    html = html.replace('../../statics/', options.statics);
  }

  html = html.replace(
    'http://localhost:3000/statics/css/bulma.css',
    'https://s3-eu-west-1.amazonaws.com/safetyapps-assets-testing/statics/css/bulma.css');

  if (process.env.NODE_ENV === 'development') {
    fs.writeFileSync(`${process.env.HOME}/Desktop/report.html`, html);
  }

  await promisify(fn => {
    page.onLoadFinished = () => setTimeout(fn, 500);
    page.setContent(html, null);
  })();

  await page.render(tmpfile, { format: 'pdf' });

  browser.exit();

  return tmpfile;
};

