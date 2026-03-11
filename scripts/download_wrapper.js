const https = require('https');
const fs = require('fs');

const url = 'https://raw.githubusercontent.com/gradle/gradle/master/gradle/wrapper/gradle-wrapper.jar';
const dest = 'C:\\Users\\evere\\Downloads\\3r Laundry\\3R Laundry service\\gradle-wrapper.jar';

console.log(`Downloading from ${url} to ${dest}...`);

const file = fs.createWriteStream(dest);
https.get(url, function(response) {
  console.log('Response status:', response.statusCode);
  if (response.statusCode === 200) {
      response.pipe(file);
      file.on('finish', function() {
          file.close(() => {
              console.log('Download completed.');
              const stats = fs.statSync(dest);
              console.log('File size:', stats.size);
          });
      });
  } else {
      console.log('Failed to download, status code: ' + response.statusCode);
      if (response.headers.location) {
          console.log('Redirect to: ' + response.headers.location);
      }
  }
}).on('error', function(err) {
  fs.unlink(dest, () => {});
  console.log('Error: ' + err.message);
});
