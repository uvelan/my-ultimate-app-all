export interface SmsMessage {
    _id?: string | number;
    address?: string | null;
    body?: string | null;
    date?: number | string;
    truncated?: boolean;
}

export interface ParsedSmsTransaction {
    id: string;
    type: 'EXPENSE' | 'INCOME';
    amount: number;
    amountPaise: number;
    source: 'Bank' | 'UPI' | 'Card' | 'Transfer' | 'ATM';
    notes: string;
    date: string;
    rawDateMillis: number;
    rawBody: string;
    synced: boolean;
    fingerprint: string;
    bank: string | null;
    account: string | null;
    merchant: string | null;
    reference: string | null;
}

const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
const senderName = (sender: string) => normalize(sender).toUpperCase().replace(/^[A-Z]{2}-/, '').replace(/-[PTSG]$/, '');

// Pure SHA-256 keeps identities stable across rescans and app restarts without
// sending SMS text anywhere or requiring a native crypto module/Expo Go plugin.
function sha256(value: string): string {
    const bytes: number[] = [];
    for (const char of value) {
        const point = char.codePointAt(0)!;
        if (point < 0x80) bytes.push(point);
        else if (point < 0x800) bytes.push(0xc0 | point >>> 6, 0x80 | point & 63);
        else if (point < 0x10000) bytes.push(0xe0 | point >>> 12, 0x80 | point >>> 6 & 63, 0x80 | point & 63);
        else bytes.push(0xf0 | point >>> 18, 0x80 | point >>> 12 & 63, 0x80 | point >>> 6 & 63, 0x80 | point & 63);
    }
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let index = 7; index >= 0; index--) bytes.push(Math.floor(bitLength / 2 ** (index * 8)) & 255);
    const primes: number[] = [];
    for (let candidate = 2; primes.length < 64; candidate++) {
        if (!primes.some(prime => candidate % prime === 0)) primes.push(candidate);
    }
    const constants = primes.map(prime => Math.floor((Math.cbrt(prime) % 1) * 2 ** 32) | 0);
    const hash = primes.slice(0, 8).map(prime => Math.floor((Math.sqrt(prime) % 1) * 2 ** 32) | 0);
    const rotate = (word: number, bits: number) => word >>> bits | word << (32 - bits);
    for (let offset = 0; offset < bytes.length; offset += 64) {
        const words: number[] = [];
        for (let index = 0; index < 16; index++) {
            const start = offset + index * 4;
            words[index] = bytes[start] << 24 | bytes[start + 1] << 16 | bytes[start + 2] << 8 | bytes[start + 3];
        }
        for (let index = 16; index < 64; index++) {
            const a = words[index - 15], b = words[index - 2];
            words[index] = (words[index - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ a >>> 3) + words[index - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ b >>> 10)) | 0;
        }
        let [a, b, c, d, e, f, g, h] = hash;
        for (let index = 0; index < 64; index++) {
            const first = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + (e & f ^ ~e & g) + constants[index] + words[index]) | 0;
            const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + (a & b ^ a & c ^ b & c)) | 0;
            h = g; g = f; f = e; e = d + first | 0; d = c; c = b; b = a; a = first + second | 0;
        }
        for (const [index, word] of [a, b, c, d, e, f, g, h].entries()) hash[index] = hash[index] + word | 0;
    }
    return hash.map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
}

function paise(raw: string): number | null {
    if (!/^\d+(?:,\d+)*(?:\.\d{1,2})?$/.test(raw)) return null;
    const groupedWhole = raw.split('.')[0];
    if (groupedWhole.includes(',') && !/^(?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})$/.test(groupedWhole)) return null;
    const [whole, fraction = ''] = raw.replace(/,/g, '').split('.');
    const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(value) && value > 0 && value <= 10_000_000_000 ? value : null;
}

function fingerprintFor(message: SmsMessage, transaction?: Pick<ParsedSmsTransaction, 'reference' | 'bank' | 'account' | 'type' | 'amountPaise'>): string {
    const identity = transaction?.reference ? ['reference-v1', transaction.bank || senderName(message.address || ''),
        transaction.account || '', transaction.type, transaction.amountPaise, transaction.reference.toUpperCase()]
        : ['message-v1', senderName(message.address || ''), String(message.date ?? ''), normalize(message.body || '')];
    return 'sms-v1:' + sha256(JSON.stringify(identity));
}

export function smsFingerprint(message: SmsMessage): string {
    return parseSmsTransaction(message)?.fingerprint || fingerprintFor(message);
}

export function parseSmsTransaction(message: SmsMessage): ParsedSmsTransaction | null {
    if (typeof message.body !== 'string' || message.truncated || message.body.length > 32768) return null;
    const body = normalize(message.body);
    const rawDateMillis = typeof message.date === 'number' ? message.date
        : typeof message.date === 'string' && /^\d+$/.test(message.date) ? Number(message.date) : NaN;
    if (!body || !Number.isSafeInteger(rawDateMillis) || rawDateMillis <= 0 || rawDateMillis > 8_640_000_000_000_000 - 19_800_000) return null;
    if (/\b(?:failed|declined|rejected|unsuccessful|cancelled|canceled|reversed|reversal|not debited|not credited)\b/i.test(body)) return null;
    if (/\b(?:will be|scheduled|payment due|amount due|minimum due|reminder|collect request|payment request|requested to pay|request received|pre-approved|apply now|offer valid|eligible for|win up to|cashback up to)\b/i.test(body)) return null;
    if (/\b(?:one[ -]time password|verification code|authori[sz]ation code|otp\s*(?:is|for|:|\d+)|\d{4,8}\s+(?:is\s+your\s+)?otp)\b/i.test(body)) return null;

    // HDFC card-on-UPI receipts omit the usual debit/success verbs. Require
    // the complete receipt structure so generic card/UPI notices stay excluded.
    const hdfcCardReceipt = senderName(message.address || '') === 'HDFCBK'
        ? body.match(/^Txn\s+(?:Rs\.?|INR|\u20b9)\s*\d[\d,]*(?:\.\d+)?\s+On\s+HDFC\s+Bank\s+Card\s+[xX*\d]{4,}\s+At\s+(.+?)\s+by\s+UPI\s+(\d{12})\s+On\s+\d{2}-\d{2}(?:-\d{2,4})?(?=\s|[.,]|$)/i)
        : null;
    const debit = /\b(?:debited|spent|paid|sent|withdrawn|deducted|purchased)\b/gi;
    const credit = /\b(?:credited|received|refunded)\b/gi;
    let verbs = Array.from(body.matchAll(debit));
    let type: ParsedSmsTransaction['type'] = 'EXPENSE';
    if (!verbs.length) { verbs = Array.from(body.matchAll(credit)); type = 'INCOME'; }
    if (!verbs.length && /\b(?:card|upi)\b/i.test(body) && /\b(?:successful|completed|used at)\b/i.test(body)) {
        verbs = Array.from(body.matchAll(/\b(?:txn|transaction|purchase|used)\b/gi));
        type = 'EXPENSE';
    }
    if (!verbs.length && hdfcCardReceipt) {
        verbs = Array.from(body.matchAll(/\bTxn\b/gi));
        type = 'EXPENSE';
    }
    if (!verbs.length) return null;

    const amounts: { amount: number; score: number; index: number }[] = [];
    for (const match of body.matchAll(/(?:\u20b9|\bRs\.?|\bINR)\s*[:]?\s*(\d[\d,]*(?:\.\d+)?)/gi)) {
        const amount = paise(match[1]);
        if (amount === null) continue;
        const index = match.index!;
        const nearest = Math.min(...verbs.map(verb => Math.abs(index - verb.index!)));
        const prefix = body.slice(Math.max(0, index - 35), index);
        if (/\b(?:bal(?:ance)?|avbl|available|outstanding|limit|due)\b[^.;]*$/i.test(prefix)) continue;
        if (nearest <= 100) amounts.push({ amount, score: nearest, index });
    }
    if (!amounts.length) {
        const bare = body.match(/\b(\d[\d,]*(?:\.\d+)?)\s+(?:(?:has been|is|was)\s+)?(?:debited|credited|spent)\b/i);
        const amount = bare ? paise(bare[1]) : null;
        if (amount !== null) amounts.push({ amount, score: 0, index: bare!.index! });
    }
    if (!amounts.length) return null;
    amounts.sort((a, b) => a.score - b.score || a.index - b.index);
    const amountPaise = amounts[0].amount;
    const bankMatch = body.match(/\b(?:HDFC|SBI|ICICI|AXIS|KOTAK|PNB|CITI|BOB|IDFC|YES BANK|UNION BANK|CANARA|INDUSIND|FEDERAL|PAYTM|PHONEPE)\b/i);
    const bank = bankMatch?.[0].toUpperCase() || senderName(message.address || '') || null;
    const accountMatch = body.match(/\b(?:a\/?c|account|card)(?:\s+(?:no\.?|number|ending|ending in))?\s*[:.-]?\s*([xX*\d]{4,})\b/i);
    const accountDigits = accountMatch?.[1].replace(/\D/g, '').slice(-4);
    const account = accountDigits ? 'XX' + accountDigits : null;
    const reference = Array.from(body.matchAll(/\b(?:UTR|RRN|UPI\s*ref(?:erence)?|ref(?:erence)?|txn(?:\s*id|\s*no)?|transaction\s*id)\s*(?:no\.?|number|id)?\s*[:#.-]?\s*([a-zA-Z0-9]{6,40})\b/gi))
        .map(match => match[1]).find(value => /\d/.test(value)) || hdfcCardReceipt?.[2] || null;
    const merchantMatch = body.match(/\b(?:to|at|info\s*:)\s+(.+?)(?=\s+(?:on|via|ref(?:erence)?|UPI\s*ref|UTR|RRN|bal(?:ance)?|avbl|available|a\/?c|account)\b|[;\n]|$)/i);
    let merchant = (hdfcCardReceipt?.[1] || merchantMatch?.[1])?.replace(/[.,\s]+$/, '').trim().slice(0, 80) || null;
    if (merchant && /^(?:your\s+)?(?:a\/?c|account|card)\b/i.test(merchant)) merchant = null;
    const source: ParsedSmsTransaction['source'] = /\bATM\b/i.test(body) ? 'ATM'
        : /\bUPI\b/i.test(body) ? 'UPI' : /\bcard\b/i.test(body) ? 'Card'
        : /\b(?:NEFT|RTGS|IMPS)\b/i.test(body) ? 'Transfer' : 'Bank';
    const fingerprint = fingerprintFor(message, { reference, bank, account, type, amountPaise });
    // The Android inbox timestamp is authoritative. Use its India calendar day,
    // rather than guessing whether a date in text is a due date or txn date.
    const date = new Date(rawDateMillis + 330 * 60_000).toISOString().split('T')[0];
    return {
        id: message._id != null ? String(message._id) : fingerprint, type, amount: amountPaise / 100, amountPaise,
        source, notes: `${bank ? bank + ' ' : ''}${source} - ${merchant || (type === 'INCOME' ? 'Credit' : 'Transaction')}`,
        date, rawDateMillis, rawBody: message.body, synced: false, fingerprint, bank, account, merchant, reference,
    };
}

// Work in integer paise to preserve exact totals for reviewed SMS amounts.
export function smsTransactionTotals(items: Pick<ParsedSmsTransaction, 'type' | 'amountPaise'>[]) {
    let expensePaise = 0, incomePaise = 0;
    for (const item of items) {
        if (item.type === 'EXPENSE') expensePaise += item.amountPaise;
        else if (item.type === 'INCOME') incomePaise += item.amountPaise;
    }
    return { expensePaise, incomePaise, netPaise: incomePaise - expensePaise };
}
