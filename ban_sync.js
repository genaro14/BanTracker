#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import https from 'node:https';

const BANTRACKER_URL = 'https://bantrack.gpdev.com.ar/api/sync';

const JAIL = 'sshd';
const CHUNK_SIZE = 50;
const REQUEST_TIMEOUT = 30000;
const MAX_RETRIES = 3;

console.log('========================================');
console.log('BanTracker sync');
console.log('========================================');
console.log('Jail:       ' + JAIL);
console.log('URL:        ' + BANTRACKER_URL);
console.log('Chunk size: ' + CHUNK_SIZE);
console.log();

function getBannedIps() {
    console.log('[1/3] Reading Fail2Ban bans...');

    const output = execFileSync(
        'fail2ban-client',
        ['get', JAIL, 'banip'],
        {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        }
    );

    const ips = output
        .trim()
        .split(/\s+/)
        .filter(function (ip) {
            return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip);
        });

    return Array.from(new Set(ips));
}

function sleep(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

function sendChunk(ips, chunkNumber, totalChunks, attempt) {
    if (attempt === undefined) {
        attempt = 1;
    }

    return new Promise(function (resolve, reject) {
        const payload = JSON.stringify(ips);
        const url = new URL(BANTRACKER_URL);

        const request = https.request(
            {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname + url.search,
                method: 'POST',
                timeout: REQUEST_TIMEOUT,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            },
            function (response) {
                let body = '';

                response.setEncoding('utf8');

                response.on('data', function (chunk) {
                    body += chunk;
                });

                response.on('end', async function () {
                    const status = response.statusCode || 0;

                    if (status >= 200 && status < 300) {
                        console.log(
                            '  OK chunk ' +
                            chunkNumber +
                            '/' +
                            totalChunks +
                            ' (' +
                            ips.length +
                            ' IPs) HTTP ' +
                            status
                        );

                        resolve(body);
                        return;
                    }

                    if (attempt < MAX_RETRIES) {
                        console.log(
                            '  Retry chunk ' +
                            chunkNumber +
                            '/' +
                            totalChunks +
                            ' HTTP ' +
                            status +
                            ' (' +
                            attempt +
                            '/' +
                            MAX_RETRIES +
                            ')'
                        );

                        await sleep(2000 * attempt);

                        try {
                            const result = await sendChunk(
                                ips,
                                chunkNumber,
                                totalChunks,
                                attempt + 1
                            );

                            resolve(result);
                        } catch (error) {
                            reject(error);
                        }

                        return;
                    }

                    reject(
                        new Error(
                            'Chunk ' +
                            chunkNumber +
                            '/' +
                            totalChunks +
                            ' failed with HTTP ' +
                            status +
                            ': ' +
                            body
                        )
                    );
                });
            }
        );

        request.on('timeout', function () {
            request.destroy(
                new Error(
                    'Request timeout after ' +
                    REQUEST_TIMEOUT +
                    'ms'
                )
            );
        });

        request.on('error', async function (error) {
            if (attempt < MAX_RETRIES) {
                console.log(
                    '  Retry chunk ' +
                    chunkNumber +
                    '/' +
                    totalChunks +
                    ': ' +
                    error.message +
                    ' (' +
                    attempt +
                    '/' +
                    MAX_RETRIES +
                    ')'
                );

                await sleep(2000 * attempt);

                try {
                    const result = await sendChunk(
                        ips,
                        chunkNumber,
                        totalChunks,
                        attempt + 1
                    );

                    resolve(result);
                } catch (retryError) {
                    reject(retryError);
                }

                return;
            }

            reject(error);
        });

        request.write(payload);
        request.end();
    });
}

async function main() {
    const startedAt = Date.now();

    const ips = getBannedIps();

    console.log('Total banned IPs: ' + ips.length);
    console.log();

    if (ips.length === 0) {
        console.log('No banned IPs.');
        return;
    }

    const totalChunks = Math.ceil(ips.length / CHUNK_SIZE);

    console.log('[2/3] Sending chunks...');
    console.log('Total chunks: ' + totalChunks);
    console.log();

    let sent = 0;

    for (let i = 0; i < ips.length; i += CHUNK_SIZE) {
        const chunk = ips.slice(i, i + CHUNK_SIZE);
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;

        await sendChunk(
            chunk,
            chunkNumber,
            totalChunks
        );

        sent += chunk.length;
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log();
    console.log('[3/3] Complete');
    console.log('========================================');
    console.log('IPs read:    ' + ips.length);
    console.log('IPs sent:    ' + sent);
    console.log('Chunks sent: ' + totalChunks);
    console.log('Time:        ' + elapsed + 's');
    console.log('========================================');
}

main().catch(function (error) {
    console.error();
    console.error('SYNC FAILED');
    console.error(error.message);
    process.exit(1);
});

