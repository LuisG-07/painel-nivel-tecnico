// build.js — generates dist/SkillMatrix_Pro.html (standalone, no external files)
// Usage: node build.js
// Requires Node.js (no npm packages needed)

var fs   = require('fs');
var path = require('path');

var ROOT = __dirname;
var DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Inline CSS
html = html.replace(
  /<link rel="stylesheet" href="css\/main\.css">/,
  '<style>\n' + fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8') + '\n</style>'
);

// Inline JS files (replace each <script src="..."> tag)
var jsFiles = [
  'js/data/seed.js',
  'js/store/storage.js',
  'js/domain/scores.js',
  'js/ui/overview.js',
  'js/ui/evolution.js',
  'js/ui/training.js',
  'js/ui/modals.js',
  'js/main.js'
];

jsFiles.forEach(function(rel) {
  var tag = '<script src="' + rel + '"></script>';
  var content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  html = html.replace(tag, '<script>\n' + content + '\n</script>');
});

var outFile = path.join(DIST, 'SkillMatrix_Pro.html');
fs.writeFileSync(outFile, html, 'utf8');

var sizeKB = Math.round(fs.statSync(outFile).size / 1024);
console.log('Build OK → dist/SkillMatrix_Pro.html (' + sizeKB + ' KB)');
