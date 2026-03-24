import fs from 'fs';
import path from 'path';

const searchDirs = [
    'c:/Users/MuriloSTR/Downloads/Dudit/app',
    'c:/Users/MuriloSTR/Downloads/Dudit/components',
    'c:/Users/MuriloSTR/Downloads/Dudit/lib'
];
const iconsToReplace = ['Download', 'Eye', 'Mail', 'Plus', 'Printer', 'Star'];

function walkSync(dir, filelist = []) {
    if (!fs.existsSync(dir)) return filelist;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const dirFile = path.join(dir, file);
        const dirent = fs.statSync(dirFile);
        if (dirent.isDirectory()) {
            if (!dirFile.includes('node_modules') && !dirFile.includes('.next')) {
                filelist = walkSync(dirFile, filelist);
            }
        } else {
            if (dirFile.endsWith('.tsx') || dirFile.endsWith('.ts')) {
                filelist.push(dirFile);
            }
        }
    }
    return filelist;
}

let allFiles = [];
for (const dir of searchDirs) {
    allFiles = allFiles.concat(walkSync(dir));
}

let updatedCount = 0;

for (const file of allFiles) {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;
    let changed = false;

    const importRegex = /import\s+\{([^}]*)\}\s+from\s+['"]@\/lib\/icons['"]/g;
    let match;
    // Use a string matching all matches since regex.exec is stateful and we modify content
    // actually we just check what's imported, then do global replace
    let importsMatched = [...content.matchAll(importRegex)];

    for (const m of importsMatched) {
        const importedIcons = m[1].split(',').map(s => s.trim());

        for (const icon of iconsToReplace) {
            if (importedIcons.includes(icon)) {
                // Global replace with negative lookarounds
                // Exclude preceding/following: letters, digits, underscores, dashes, quotes, slashes
                const regex = new RegExp(`(?<!["'\\\\a-zA-Z0-9_\\-.])\\b${icon}\\b(?![a-zA-Z0-9_\\-"'])`, 'g');
                content = content.replace(regex, `${icon}Icon`);
                changed = true;
            }
        }
    }

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
        updatedCount++;
    }
}

console.log(`Finished checking files. Updated ${updatedCount} files.`);
