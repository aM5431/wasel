const HijriDate = require('hijri-date').default;
const hijri = new HijriDate();
console.log('hijri object:', hijri);
console.log('getYear:', hijri.getYear ? 'exists' : 'missing');
console.log('getFullYear:', hijri.getFullYear ? 'exists' : 'missing');
console.log('year:', hijri.year ? 'exists' : 'missing');
