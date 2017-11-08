const promisify = require('util').promisify;
const nunjucks = require('nunjucks');
const fs = require('fs');

const pdf = require('./');

const [tmplFile, stubFile] = process.argv.slice(2);

const templateConfig = {
  path: `${process.cwd()}${process.env.TEMPLATE_PATH || '/templates'}`,
  autoescape: true,
  trimBlocks: true,
  noCache: process.env.NODE_ENV === 'development'
};

nunjucks.configure(templateConfig.path, templateConfig);

module.exports.template = (template, options) => {
  if (/[<>{}]/.test(template)) {
    return nunjucks.renderString(template, options);
  }

  template = template.replace(/(\.html|)+$/, '.html');
  return nunjucks.render(template, options);
};

const utcOffset = 0;
const locale = 'en-US';

const data = Object.assign(require(stubFile), {
  outputFile: `${process.env.HOME}/Desktop/stub.pdf`
});

data.formatDate = (date, type) => {
  if (!date) {
    return date;
  }

  if (typeof date === 'string') {
    const parsed = new Date(date);
    if (parsed instanceof Date && !isNaN(parsed)) {
      date = parsed;
    }
  }

  if (!date instanceof Date || isNaN(date)) {
    return date;
  }

  date = new Date(date.getTime() + utcOffset * 60 * 1000);

  return type === 'time' ? date.toLocaleTimeString(locale) :
    type === 'datetime' ? date.toLocaleString(locale) :
    date.toLocaleDateString(locale);
};

data.formatDateTime = date => data.formatDate(date, 'datetime');

data.formatTime = date => data.formatDate(date, 'time');

data.formatNumber = (number, decimals = null, loc = locale) => {
  if (decimals !== null) {
    number = Number(number).toFixed(decimals);
  }

  const str = String(isNaN(number) ? 0 : number);

  if (/en|us|gb/i.test(loc)) {
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return str.replace(/\.([^\.]+)$/, ',$1').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

(async () => {
  const tmpl = await promisify(fs.readFile)(tmplFile, 'utf8');
  const html = module.exports.template(tmpl, data);
  const output = await pdf(html, data);

  require('open')(output, 'preview');
})();
