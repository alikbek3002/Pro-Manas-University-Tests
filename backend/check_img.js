const fs = require('fs');
const path = require('path');
const buffer = fs.readFileSync(path.join(__dirname, '../student-frontend/src/assets/pro-manas-logo.png'));
const base64 = buffer.toString('base64');
console.log('Base64 length:', base64.length);
console.log('Prefix:', base64.substring(0, 100));
