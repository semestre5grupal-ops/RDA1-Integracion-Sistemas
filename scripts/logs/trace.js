#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const correlationId = process.argv[2];
if (!correlationId) {
  process.stderr.write('Uso: node scripts/logs/trace.js <correlationId>\n');
  process.exitCode = 2;
} else {
  const logsDirectory = path.resolve(process.cwd(), 'logs');
  const records = [];

  if (fs.existsSync(logsDirectory)) {
    for (const serviceName of fs.readdirSync(logsDirectory)) {
      const serviceDirectory = path.join(logsDirectory, serviceName);
      if (!fs.statSync(serviceDirectory).isDirectory()) continue;
      for (const filename of fs.readdirSync(serviceDirectory)) {
        if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(filename)) continue;
        const filePath = path.join(serviceDirectory, filename);
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            if (record.correlation_id === correlationId) records.push(record);
          } catch (error) {
            process.stderr.write(`Línea JSON inválida en ${filePath}: ${error.message}\n`);
          }
        }
      }
    }
  }

  records.sort((first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp));
  for (const record of records) process.stdout.write(`${JSON.stringify(record)}\n`);
  if (records.length === 0) {
    process.stderr.write(`No se encontraron logs para correlation_id ${correlationId}.\n`);
    process.exitCode = 1;
  }
}
