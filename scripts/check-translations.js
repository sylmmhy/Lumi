#!/usr/bin/env node

/**
 * 翻译完整性检查脚本
 * 用法: node scripts/check-translations.js
 *
 * 以英文 (en.json) 为基准，检查其他语言是否有缺失的 key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '../src/locales');
const BASE_LANG = 'en';

function loadLocale(lang) {
  const filePath = path.join(LOCALES_DIR, `${lang}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Failed to load ${lang}.json:`, e.message);
    return null;
  }
}

function getLocaleFiles() {
  return fs.readdirSync(LOCALES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

function checkTranslations() {
  const languages = getLocaleFiles();
  const baseLocale = loadLocale(BASE_LANG);

  if (!baseLocale) {
    console.error(`Base language ${BASE_LANG}.json not found!`);
    process.exit(1);
  }

  const baseKeys = Object.keys(baseLocale);
  console.log(`\n📋 Base language: ${BASE_LANG} (${baseKeys.length} keys)\n`);

  let hasErrors = false;
  const results = [];

  for (const lang of languages) {
    if (lang === BASE_LANG) continue;

    const locale = loadLocale(lang);
    if (!locale) continue;

    const localeKeys = Object.keys(locale);
    const missingKeys = baseKeys.filter(key => !locale.hasOwnProperty(key));
    const extraKeys = localeKeys.filter(key => !baseLocale.hasOwnProperty(key));

    results.push({
      lang,
      total: localeKeys.length,
      missing: missingKeys,
      extra: extraKeys
    });

    if (missingKeys.length > 0) hasErrors = true;
  }

  // 输出结果
  for (const r of results) {
    const status = r.missing.length === 0 ? '✅' : '❌';
    console.log(`${status} ${r.lang}.json (${r.total} keys)`);

    if (r.missing.length > 0) {
      console.log(`   缺失 ${r.missing.length} 个 key:`);
      r.missing.forEach(k => console.log(`     - ${k}`));
    }

    if (r.extra.length > 0) {
      console.log(`   多余 ${r.extra.length} 个 key:`);
      r.extra.forEach(k => console.log(`     - ${k}`));
    }
  }

  console.log('');

  if (hasErrors) {
    console.log('❌ 翻译不完整，请补充缺失的 key\n');
    process.exit(1);
  } else {
    console.log('✅ 所有翻译完整!\n');
    process.exit(0);
  }
}

checkTranslations();
