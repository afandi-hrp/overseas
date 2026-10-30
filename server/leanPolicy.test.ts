// Tes pembatasan proxy lean-api utk user yang hanya punya cost_agent_invoice. Jalankan: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRestrictedOData } from './leanPolicy';

const SUP = 'AP_Suppliers';
const base = (extra: string) => `database=AS_MJS&$select=SupplierID,SupplierCode,SupplierName,NPWP,Disabled${extra}`;
const bad = (sub: string, q: string) => { const r = checkRestrictedOData(sub, q); assert.equal(r.ok, false, `harus ditolak: ${sub}?${q}`); };
const good = (sub: string, q: string) => { const r = checkRestrictedOData(sub, q); assert.equal(r.ok, true, `harus lolos: ${sub}?${q}`); return r.ok ? r.query : ''; };

test('query sah lolos (3 entity, kolom aman, filter dengan literal & kata kunci OData)', () => {
  good(SUP, base(''));
  good(SUP, base(`&$filter=${encodeURIComponent("contains(SupplierName,'ABC') and Disabled eq false")}&$top=50&$count=true`));
  good(SUP, base(`&$filter=${encodeURIComponent("NPWP eq '01.234.567.8-901.000' or contains(NPWP,'012345678901000')")}&$orderby=${encodeURIComponent('SupplierName asc')}`));
  good('IC_InventoryUsers_Fleet', 'database=AS_WNS&$select=InventoryUserID,InventoryUserCode,InventoryUserName,FleetName,Disabled,IsVessel&$filter=' + encodeURIComponent("contains(InventoryUserName,'BERLIAN') and IsVessel eq true"));
  good('FI_ExpenseTypes_Account', 'database=AS_AMT&$select=ExpenseTypeID,ExpenseTypeDescription,AccountName,Disabled&$skip=100');
});

test('AC_Accounts (COA): kolom aman lolos, kolom lain ditolak', () => {
  good('AC_Accounts', 'database=AS_WNS&$select=AccountID,AccountCode,AccountName,IsDisabled&$filter=' + encodeURIComponent("IsDisabled eq false and (contains(AccountName,'FUEL') or contains(AccountCode,'FUEL'))") + '&$orderby=AccountCode&$top=50');
  bad('AC_Accounts', 'database=AS_WNS&$select=AccountID,Balance');
  bad('AC_Accounts', 'database=AS_WNS&$select=AccountID&$filter=' + encodeURIComponent('Balance gt 0'));
});

test('literal berisi kata/kolom terlarang tidak diperiksa (diabaikan), tanda kutip ganda ("") sah', () => {
  good(SUP, base(`&$filter=${encodeURIComponent("contains(SupplierName,'BankAccount; DROP /x $y')")}`));
  good(SUP, base(`&$filter=${encodeURIComponent("contains(SupplierName,'O''Brien')")}`));
});

test('$select kolom bank/KTP ditolak', () => {
  bad(SUP, 'database=AS_MJS&$select=SupplierID,BankAccountNo');
  bad(SUP, 'database=AS_MJS&$select=SupplierID,KTP');
  bad(SUP, 'database=AS_MJS&$select=*');
  bad(SUP, 'database=AS_MJS&$select=npwp'); // beda huruf besar/kecil = bukan kolom aman
});

test('$select wajib', () => {
  bad(SUP, 'database=AS_MJS');
  bad(SUP, 'database=AS_MJS&$select=');
});

test('$search dan parameter lain ditolak', () => {
  bad(SUP, base('&$search=bca'));
  bad(SUP, base('&$expand=Banks'));
  bad(SUP, base('&$apply=groupby((SupplierName))'));
  bad(SUP, base('&$format=json'));
  bad(SUP, base('&$Select=BankAccountNo'));
});

test('parameter ganda ditolak', () => {
  bad(SUP, base('&$select=BankAccountNo'));
  bad(SUP, base('&database=AS_WNS'));
});

test('$filter / $orderby ke kolom bank ditolak', () => {
  bad(SUP, base(`&$filter=${encodeURIComponent("startswith(BankAccountNo,'1') eq true")}`));
  bad(SUP, base(`&$filter=${encodeURIComponent("BankAccountNo eq '1'")}`));
  bad(SUP, base(`&$orderby=${encodeURIComponent('BankAccountNo desc')}`));
  bad(SUP, base(`&$filter=${encodeURIComponent("Banks/AccountNo eq '1'")}`)); // path navigasi
  bad(SUP, base(`&$filter=${encodeURIComponent("Disabled eq false and $it/Bank eq 1")}`));
  bad(SUP, base(`&$filter=${encodeURIComponent("Disabled eq @p")}`));
  bad(SUP, base(`&$filter=${encodeURIComponent("contains(SupplierName,'x") }`)); // literal tidak tertutup
});

test('entity lain ditolak (termasuk bentuk key, $metadata, root)', () => {
  bad('IC_InventoryUsers', 'database=AS_MJS&$select=InventoryUserID');
  bad('FI_ExpenseTypes', 'database=AS_MJS&$select=ExpenseTypeID');
  bad('AP_Suppliers(5)', base(''));
  bad('$metadata', 'database=AS_MJS');
  bad('', 'database=AS_MJS');
  bad('AP_Banks', 'database=AS_MJS&$select=BankID');
});

test('database salah ditolak', () => {
  bad(SUP, '$select=SupplierID');
  bad(SUP, 'database=&$select=SupplierID');
  bad(SUP, 'database=master&$select=SupplierID');
  bad(SUP, 'database=as_mjs&$select=SupplierID');
  bad(SUP, 'database=AS_&$select=SupplierID');
  bad(SUP, 'database=AS_MJS;DROP&$select=SupplierID');
  bad(SUP, 'database=AS_ABCDEFGHIJKLM&$select=SupplierID'); // 13 karakter
});

test('$top / $skip / $count dibatasi', () => {
  bad(SUP, base('&$top=5000'));
  bad(SUP, base('&$top=-1'));
  bad(SUP, base('&$skip=abc'));
  bad(SUP, base('&$count=maybe'));
});

test('query diteruskan adalah hasil susun ulang (parameter mentah tidak ikut)', () => {
  const q = good(SUP, base('&$top=10'));
  assert.equal(new URLSearchParams(q).get('$top'), '10');
  assert.deepEqual([...new URLSearchParams(q).keys()].sort(), ['$select', '$top', 'database']);
});
