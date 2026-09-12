/**
 * RenegadeSwarm - License Header Applier Script
 * Automatically applies standard GPL-3.0 header comments to all source & test files.
 */
const fs = require('fs');
const path = require('path');

const GPL_BANNER = `/**
 * RenegadeSwarm - Decentralized AI Model Distribution Network
 * Copyright (C) 2026 DevNullInc & The RenegadeSwarm Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
`;

function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(fullPath);
    }
  });
  return results;
}

const targetDirs = ['src', 'tests'];
let updatedCount = 0;
let skippedCount = 0;

for (const dir of targetDirs) {
  const files = getFiles(path.resolve(__dirname, '..', dir));
  for (const filePath of files) {
    let content = fs.readFileSync(filePath, 'utf-8');

    if (content.includes('GNU General Public License')) {
      skippedCount++;
      continue;
    }

    // If file starts with a short JSDoc header without license, clean it up or prepend
    if (content.startsWith('/**') && content.indexOf('*/') !== -1) {
      const endOfComment = content.indexOf('*/') + 2;
      const existingHeader = content.substring(0, endOfComment);
      if (!existingHeader.includes('GNU General Public License')) {
        // Replace or prepend
        content = GPL_BANNER + '\n' + content.substring(endOfComment).trimStart();
      }
    } else {
      content = GPL_BANNER + '\n' + content;
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    updatedCount++;
    console.log(`Applied GPL-3.0 header: ${path.relative(path.resolve(__dirname, '..'), filePath)}`);
  }
}

console.log(`\nLicense Header Application Summary:`);
console.log(`- Updated: ${updatedCount} files`);
console.log(`- Already Compliant: ${skippedCount} files`);
