const fetch = require('node-fetch');

function chunkArray(array, size) {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

async function fetchAndAggregateBitlyMetrics(requests, units, bitlyHeaders) {
  let totalClicks = 0;
  const clicksMap = {};
  const countriesMap = {};
  const citiesMap = {};
  const referrersMap = {};
  const devicesMap = {};
  const topLinks = [];

  const chunks = chunkArray(requests, 5);

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (req) => {
      try {
        const [summaryRes, clicksRes, countriesRes, citiesRes, referrersRes, devicesRes] = await Promise.all([
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/clicks/summary`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/clicks?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/countries?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/cities?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/referrers?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/devices?unit=day&units=${units}`, { headers: bitlyHeaders })
        ]);

        const summaryData = summaryRes.ok ? await summaryRes.json() : {};
        const linkTotal = summaryData.total_clicks || 0;
        totalClicks += linkTotal;

        topLinks.push({ ...req, totalClicks: linkTotal });

        const clicksData = clicksRes.ok ? await clicksRes.json() : { link_clicks: [] };
        (clicksData.link_clicks || []).forEach(item => {
          const d = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
          clicksMap[d] = (clicksMap[d] || 0) + item.clicks;
        });

        const countriesData = countriesRes.ok ? await countriesRes.json() : { metrics: [] };
        (countriesData.metrics || []).forEach(item => {
          const key = item.value || 'Unknown';
          countriesMap[key] = (countriesMap[key] || 0) + item.clicks;
        });

        const citiesData = citiesRes.ok ? await citiesRes.json() : { metrics: [] };
        (citiesData.metrics || []).forEach(item => {
          const cityStr = item.value || item.city || 'Unknown';
          const ctryStr = item.country || '';
          const key = cityStr + (ctryStr ? `, ${ctryStr}` : '');
          citiesMap[key] = (citiesMap[key] || 0) + item.clicks;
        });

        const referrersData = referrersRes.ok ? await referrersRes.json() : { metrics: [] };
        (referrersData.metrics || []).forEach(item => {
          const key = item.value || 'Direct';
          referrersMap[key] = (referrersMap[key] || 0) + item.clicks;
        });

        const devicesData = devicesRes.ok ? await devicesRes.json() : { metrics: [] };
        (devicesData.metrics || []).forEach(item => {
          const key = item.device_type || item.value || 'Unknown';
          devicesMap[key] = (devicesMap[key] || 0) + item.clicks;
        });
      } catch (e) {
        console.error(`Failed to process ${req.bitlinkId}`, e);
      }
    }));
  }

  const clickData = Object.keys(clicksMap).map(date => ({ date, clicks: clicksMap[date], _raw: new Date(date) }))
    .sort((a, b) => a._raw - b._raw).map(i => ({ date: i.date, clicks: i.clicks }));
  const countries = Object.keys(countriesMap).map(country => ({ country, clicks: countriesMap[country] })).sort((a,b)=>b.clicks-a.clicks);
  const cities = Object.keys(citiesMap).map(city => ({ city, clicks: citiesMap[city] })).sort((a,b)=>b.clicks-a.clicks);
  const referrers = Object.keys(referrersMap).map(referrer => ({ referrer, clicks: referrersMap[referrer] })).sort((a,b)=>b.clicks-a.clicks);
  const devices = Object.keys(devicesMap).map(device => ({ device, clicks: devicesMap[device] })).sort((a,b)=>b.clicks-a.clicks);

  return { totalClicks, clickData, countries, cities, referrers, devices };
}

async function main(params) {
  const { objID, objCode = 'OPTASK', hostname, imsToken, BITLY_TOKEN, units = 540, selectedRequest = 'ALL' } = params;

  if (!hostname || !imsToken || !objID) return { statusCode: 400, body: { error: 'Missing required parameters.' } };

  try {
    let targetRequests = [];
    let availableRequests = [];
    let displayShortUrl = '';
    const isProject = objCode.toUpperCase() === 'PROJ' || objCode.toUpperCase() === 'PROJECT';

    if (isProject) {
      const wfUrl = `https://${hostname}/attask/api/v15.0/issue/search?projectID=${objID}&fields=parameterValues,name,referenceNumber,project:name`;
      const wfResponse = await fetch(wfUrl, { headers: { 'Authorization': `Bearer ${imsToken}`, 'Content-Type': 'application/json' }});
      if (!wfResponse.ok) throw new Error(`Workfront API error: ${wfResponse.statusText}`);
      
      const tasks = (await wfResponse.json()).data || [];
      availableRequests = tasks.reduce((acc, task) => {
        const raw = task.parameterValues?.['DE:Bitly Shortlink ID'] || task.parameterValues?.['Bitly Shortlink ID'];
        if (raw) {
          acc.push({
            id: task.ID,
            name: task.name,
            ref: task.referenceNumber,
            projectName: task.project?.name || 'Unknown',
            shortUrl: raw.startsWith('http') ? raw : `https://${raw}`,
            bitlinkId: raw.replace(/^https?:\/\//, '')
          });
        }
        return acc;
      }, []);

      if (availableRequests.length === 0) return { statusCode: 200, body: { hasLink: false, message: 'No Bitly shortlinks found in this Project.' }};

      if (selectedRequest === 'ALL') {
        targetRequests = availableRequests;
        displayShortUrl = `${availableRequests.length} Links Aggregated`;
      } else {
        const matched = availableRequests.find(r => r.id === selectedRequest);
        targetRequests = matched ? [matched] : availableRequests;
        displayShortUrl = matched ? matched.shortUrl : `${availableRequests.length} Links Aggregated`;
      }
    } 
    else {
      const wfUrl = `https://${hostname}/attask/api/v15.0/optask/${objID}?fields=parameterValues,name,referenceNumber,project:name`;
      const wfResponse = await fetch(wfUrl, { headers: { 'Authorization': `Bearer ${imsToken}`, 'Content-Type': 'application/json' }});
      if (!wfResponse.ok) throw new Error(`Workfront API error: ${wfResponse.statusText}`);

      const task = (await wfResponse.json()).data || {};
      const raw = task.parameterValues?.['DE:Bitly Shortlink ID'] || task.parameterValues?.['Bitly Shortlink ID'];

      if (!raw) return { statusCode: 200, body: { hasLink: false, message: 'No "DE:Bitly Shortlink ID" custom field set on this Request.' }};

      targetRequests = [{
        id: task.ID,
        name: task.name,
        ref: task.referenceNumber,
        projectName: task.project?.name || 'Unknown',
        shortUrl: raw.startsWith('http') ? raw : `https://${raw}`,
        bitlinkId: raw.replace(/^https?:\/\//, '')
      }];
      displayShortUrl = targetRequests[0].shortUrl;
    }

    const aggData = await fetchAndAggregateBitlyMetrics(targetRequests, units, { 'Authorization': `Bearer ${BITLY_TOKEN}` });

    return {
      statusCode: 200,
      body: { hasLink: true, isProject, availableRequests, shortUrl: displayShortUrl, ...aggData }
    };
  } catch (err) {
    return { statusCode: 500, body: { error: err.message } };
  }
}

exports.main = main;