const fetch = require('node-fetch');

function chunkArray(array, size) {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

function appendOtherMetrics(apiResponse, metricMap, label) {
  if (!apiResponse || !apiResponse.other_metrics) return;
  for (const [key, value] of Object.entries(apiResponse.other_metrics)) {
    if (typeof value === 'number' && value > 0) {
      if (key.startsWith('other_')) {
        metricMap[`Other ${label}`] = (metricMap[`Other ${label}`] || 0) + value;
      } else if (key.startsWith('no_')) {
        metricMap[`Unknown ${label}`] = (metricMap[`Unknown ${label}`] || 0) + value;
      } else {
        metricMap[`Other ${label}`] = (metricMap[`Other ${label}`] || 0) + value;
      }
    }
  }
}

// 1. Bitlink Aggregator
async function fetchAndAggregateBitlyMetrics(requests, units, bitlyHeaders) {
  let totalClicks = 0;
  const clicksMap = {};
  const countriesMap = {};
  const citiesMap = {};
  const referrersMap = {};
  const devicesMap = {};
  const topLinks = [];
  const metadata = {};

  const chunks = chunkArray(requests, 5);

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (req) => {
      if (!req.bitlinkId) return;
      try {
        const [infoRes, summaryRes, clicksRes, countriesRes, citiesRes, referrersRes, devicesRes] = await Promise.all([
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/clicks/summary`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/clicks?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/countries?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/cities?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/referrers?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/bitlinks/${req.bitlinkId}/devices?unit=day&units=${units}`, { headers: bitlyHeaders })
        ]);

        const infoData = infoRes.ok ? await infoRes.json() : {};
        metadata[req.bitlinkId] = {
          title: infoData.title || 'Untitled Link',
          createdAt: infoData.created_at || null,
          longUrl: infoData.long_url || null,
          tags: infoData.tags || []
        };

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
        appendOtherMetrics(countriesData, countriesMap, 'Countries');

        const citiesData = citiesRes.ok ? await citiesRes.json() : { metrics: [] };
        (citiesData.metrics || []).forEach(item => {
          const cityStr = item.value || item.city || 'Unknown';
          const ctryStr = item.country || '';
          const key = cityStr + (ctryStr ? `, ${ctryStr}` : '');
          citiesMap[key] = (citiesMap[key] || 0) + item.clicks;
        });
        appendOtherMetrics(citiesData, citiesMap, 'Cities');

        const referrersData = referrersRes.ok ? await referrersRes.json() : { metrics: [] };
        (referrersData.metrics || []).forEach(item => {
          const key = item.value || 'Direct';
          referrersMap[key] = (referrersMap[key] || 0) + item.clicks;
        });
        appendOtherMetrics(referrersData, referrersMap, 'Referrers');

        const devicesData = devicesRes.ok ? await devicesRes.json() : { metrics: [] };
        (devicesData.metrics || []).forEach(item => {
          const key = item.device_type || item.value || 'Unknown';
          devicesMap[key] = (devicesMap[key] || 0) + item.clicks;
        });
        appendOtherMetrics(devicesData, devicesMap, 'Devices');

      } catch (e) {
        console.error(`Failed to process ${req.bitlinkId}`, e);
      }
    }));
  }

  const clickData = Object.keys(clicksMap).map(date => ({ date, clicks: clicksMap[date], _raw: new Date(date) })).sort((a, b) => a._raw - b._raw).map(i => ({ date: i.date, clicks: i.clicks }));
  const countries = Object.keys(countriesMap).map(country => ({ country, clicks: countriesMap[country] })).sort((a,b)=>b.clicks-a.clicks);
  const cities = Object.keys(citiesMap).map(city => ({ city, clicks: citiesMap[city] })).sort((a,b)=>b.clicks-a.clicks);
  const referrers = Object.keys(referrersMap).map(referrer => ({ referrer, clicks: referrersMap[referrer] })).sort((a,b)=>b.clicks-a.clicks);
  const devices = Object.keys(devicesMap).map(device => ({ device, clicks: devicesMap[device] })).sort((a,b)=>b.clicks-a.clicks);

  return { totalClicks, clickData, countries, cities, referrers, devices, metadata };
}

// 2. QR Code Aggregator
async function fetchAndAggregateQrMetrics(requests, units, bitlyHeaders) {
  let totalScans = 0;
  const scansMap = {};
  const countriesMap = {};
  const citiesMap = {};
  const browsersMap = {};
  const osMap = {};
  const metadata = {};

  const chunks = chunkArray(requests, 5);

  // Set explicit header for raw PNG
  const imageHeaders = { ...bitlyHeaders, 'Accept': 'image/png' };

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (req) => {
      if (!req.qrCodeId) return;
      try {
        const [infoRes, imageRes, summaryRes, scansRes, countriesRes, citiesRes, browsersRes, osRes] = await Promise.all([
          fetch(`https://api-ssl.bitly.com/v4/qr-codes/${req.qrCodeId}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/qr-codes/${req.qrCodeId}/image`, { headers: imageHeaders }), // Fetch binary PNG
          fetch(`https://api-ssl.bitly.com/v4/qr-codes/${req.qrCodeId}/scans/summary?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/qr-codes/${req.qrCodeId}/scans?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/qr-codes/${req.qrCodeId}/scans/countries?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/qr-codes/${req.qrCodeId}/scans/cities?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/qr-codes/${req.qrCodeId}/scans/browsers?unit=day&units=${units}`, { headers: bitlyHeaders }),
          fetch(`https://api-ssl.bitly.com/v4/qr-codes/${req.qrCodeId}/scans/device_os?unit=day&units=${units}`, { headers: bitlyHeaders })
        ]);

        const infoData = infoRes.ok ? await infoRes.json() : {};
        
        // Parse raw image binary to Base64
        let imageUrl = null;
        if (imageRes.ok) {
          const arrayBuffer = await imageRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          imageUrl = `data:image/png;base64,${buffer.toString('base64')}`;
        }

        metadata[req.qrCodeId] = {
          title: infoData.title || 'Untitled QR Code',
          createdAt: infoData.created || infoData.created_at || null,
          longUrl: (infoData.long_urls && infoData.long_urls.length > 0) ? infoData.long_urls[0] : (infoData.bitlink_id || null),
          imageUrl: imageUrl
        };

        const summaryData = summaryRes.ok ? await summaryRes.json() : {};
        totalScans += (summaryData.total_scans || summaryData.total_clicks || summaryData.scans || 0);

        const scansData = scansRes.ok ? await scansRes.json() : { scans: [] };
        (scansData.scans || scansData.scan_clicks || []).forEach(item => {
          const d = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
          scansMap[d] = (scansMap[d] || 0) + (item.scans || item.clicks || 0);
        });

        const countriesData = countriesRes.ok ? await countriesRes.json() : { metrics: [] };
        (countriesData.metrics || []).forEach(item => {
          const key = item.value || 'Unknown';
          countriesMap[key] = (countriesMap[key] || 0) + (item.scans || item.clicks || 0);
        });
        appendOtherMetrics(countriesData, countriesMap, 'Countries');

        const citiesData = citiesRes.ok ? await citiesRes.json() : { metrics: [] };
        (citiesData.metrics || []).forEach(item => {
          const cityStr = item.value || item.city || 'Unknown';
          const ctryStr = item.country || '';
          const key = cityStr + (ctryStr ? `, ${ctryStr}` : '');
          citiesMap[key] = (citiesMap[key] || 0) + (item.scans || item.clicks || 0);
        });
        appendOtherMetrics(citiesData, citiesMap, 'Cities');

        const browsersData = browsersRes.ok ? await browsersRes.json() : { metrics: [] };
        (browsersData.metrics || []).forEach(item => {
          const key = item.value || 'Unknown';
          browsersMap[key] = (browsersMap[key] || 0) + (item.scans || item.clicks || 0);
        });
        appendOtherMetrics(browsersData, browsersMap, 'Browsers');

        const osData = osRes.ok ? await osRes.json() : { metrics: [] };
        (osData.metrics || []).forEach(item => {
          const key = item.value || 'Unknown';
          osMap[key] = (osMap[key] || 0) + (item.scans || item.clicks || 0);
        });
        appendOtherMetrics(osData, osMap, 'Operating Systems');

      } catch (e) {
        console.error(`Failed to process QR Code ${req.qrCodeId}`, e);
      }
    }));
  }

  const scanData = Object.keys(scansMap).map(date => ({ date, scans: scansMap[date], _raw: new Date(date) })).sort((a, b) => a._raw - b._raw).map(i => ({ date: i.date, scans: i.scans }));
  const countries = Object.keys(countriesMap).map(country => ({ country, scans: countriesMap[country] })).sort((a,b)=>b.scans-a.scans);
  const cities = Object.keys(citiesMap).map(city => ({ city, scans: citiesMap[city] })).sort((a,b)=>b.scans-a.scans);
  const browsers = Object.keys(browsersMap).map(browser => ({ browser, scans: browsersMap[browser] })).sort((a,b)=>b.scans-a.scans);
  const os = Object.keys(osMap).map(operatingSystem => ({ operatingSystem, scans: osMap[operatingSystem] })).sort((a,b)=>b.scans-a.scans);

  return { totalScans, scanData, countries, cities, browsers, os, metadata };
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
      const queryParams = [
        encodeURIComponent('DE:Bitly Shortlink ID_Mod') + '=notblank',
        'OR:1:' + encodeURIComponent('DE:Bitly QR Code ID_Mod') + '=notblank',
        encodeURIComponent('fields') + '=' + encodeURIComponent('parameterValues,name,referenceNumber,project:name'),
        '$$LIMIT=100'
      ].join('&');
      
      const wfUrl = `https://${hostname}/attask/api/v15.0/issue/search?projectID=${objID}&${queryParams}`;
      const wfResponse = await fetch(wfUrl, { headers: { 'Authorization': `Bearer ${imsToken}`, 'Content-Type': 'application/json' }});
      if (!wfResponse.ok) throw new Error(`Workfront API error: ${wfResponse.statusText}`);
      
      const tasks = (await wfResponse.json()).data || [];
      availableRequests = tasks.reduce((acc, task) => {
        const rawLink = task.parameterValues?.['DE:Bitly Shortlink ID'] || task.parameterValues?.['Bitly Shortlink ID'];
        const rawQr = task.parameterValues?.['DE:Bitly QR Code ID'] || task.parameterValues?.['Bitly QR Code ID'];
        
        if (rawLink || rawQr) {
          acc.push({
            id: task.ID,
            name: task.name,
            ref: task.referenceNumber,
            projectName: task.project?.name || 'Unknown',
            shortUrl: rawLink ? (rawLink.startsWith('http') ? rawLink : `https://${rawLink}`) : null,
            bitlinkId: rawLink ? rawLink.replace(/^https?:\/\//, '') : null,
            qrCodeId: rawQr ? rawQr.trim() : null
          });
        }
        return acc;
      }, []);

      if (availableRequests.length === 0) return { statusCode: 200, body: { hasLink: false, message: 'No Bitly shortlinks or QR Codes found in this Project.' }};

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
      const rawLink = task.parameterValues?.['DE:Bitly Shortlink ID'] || task.parameterValues?.['Bitly Shortlink ID'];
      const rawQr = task.parameterValues?.['DE:Bitly QR Code ID'] || task.parameterValues?.['Bitly QR Code ID'];

      if (!rawLink && !rawQr) return { statusCode: 200, body: { hasLink: false, message: 'No Bitly custom fields set on this Request.' }};

      availableRequests = [{
        id: task.ID,
        name: task.name,
        ref: task.referenceNumber,
        projectName: task.project?.name || 'Unknown',
        shortUrl: rawLink ? (rawLink.startsWith('http') ? rawLink : `https://${rawLink}`) : null,
        bitlinkId: rawLink ? rawLink.replace(/^https?:\/\//, '') : null,
        qrCodeId: rawQr ? rawQr.trim() : null
      }];
      
      targetRequests = availableRequests;
      displayShortUrl = targetRequests[0].shortUrl || targetRequests[0].qrCodeId;
    }

    const bitlinkTargets = targetRequests.filter(r => r.bitlinkId);
    const qrTargets = targetRequests.filter(r => r.qrCodeId);

    const [bitlinkMetrics, qrMetrics] = await Promise.all([
      bitlinkTargets.length > 0 ? fetchAndAggregateBitlyMetrics(bitlinkTargets, units, { 'Authorization': `Bearer ${BITLY_TOKEN}` }) : { totalClicks: 0, clickData: [], countries: [], cities: [], referrers: [], devices: [], metadata: {} },
      qrTargets.length > 0 ? fetchAndAggregateQrMetrics(qrTargets, units, { 'Authorization': `Bearer ${BITLY_TOKEN}` }) : { totalScans: 0, scanData: [], countries: [], cities: [], browsers: [], os: [], metadata: {} }
    ]);

    return {
      statusCode: 200,
      body: { 
        hasLink: true, 
        isProject, 
        availableRequests, 
        shortUrl: displayShortUrl, 
        ...bitlinkMetrics,
        qrData: qrMetrics
      }
    };
  } catch (err) {
    return { statusCode: 500, body: { error: err.message } };
  }
}

exports.main = main;