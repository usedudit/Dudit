import fs from 'fs';
import https from 'https';

const url = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios';

https.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const data = JSON.parse(body);
    const cities = data.map(m => {
      const city = m.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const uf = m.microrregiao?.mesorregiao?.UF?.sigla?.toLowerCase() || m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla?.toLowerCase();
      if (!uf) console.log('NO UF for:', m.nome);
      return `${city}-${uf}`;
    }).filter(c => c && !c.endsWith('-undefined'));
    // Remove duplicates just in case
    const uniqueCities = [...new Set(cities)];
    fs.mkdirSync('lib/data', {recursive: true});
    fs.writeFileSync('lib/data/cities.json', JSON.stringify(uniqueCities));
    console.log(`Saved ${uniqueCities.length} cities`);
  });
}).on('error', e => console.error(e));
