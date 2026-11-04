import React, { useEffect, useState, useRef } from 'react';
import { attach } from '@adobe/uix-guest';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export default function App() {
  const [objID, setObjID] = useState(null);
  const [objCode, setObjCode] = useState(null);
  const [hostname, setHostname] = useState(null);
  const [imsToken, setImsToken] = useState(null);
  
  const [dateRange, setDateRange] = useState(540);
  const [selectedRequest, setSelectedRequest] = useState('ALL');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  
  const [locationTab, setLocationTab] = useState('countries');
  const [qrLocationTab, setQrLocationTab] = useState('countries');

  const timelineScrollRef = useRef(null);
  const qrTimelineScrollRef = useRef(null);
  
  // Ref for capturing the dashboard
  const dashboardRef = useRef(null);

  // CVS BRAND COLORS
  const CVS_RED = '#CC0000';
  const CVS_BLACK = '#000000';

  useEffect(() => {
    async function initUIX() {
      try {
        const conn = await attach({ id: 'workfront-ui-1' });

        let extractedToken = null;
        let extractedHost = window.location.hostname;
        let extractedId = null;
        let extractedCode = 'OPTASK';

        const startTime = Date.now();
        while (Date.now() - startTime < 3000) {
          const ctx = conn?.sharedContext;
          const getVal = (key) => (typeof ctx?.get === 'function' ? ctx.get(key) : ctx?.[key]);

          const authObj = getVal('auth');
          extractedToken = authObj?.imsToken || localStorage.getItem('wf_ims_token');
          extractedHost = getVal('hostname') || extractedHost;
          extractedId = getVal('objID') || getVal('objectID');
          extractedCode = getVal('objCode') || 'OPTASK';

          if (extractedToken && extractedId) break; 
          
          await new Promise((res) => setTimeout(res, 200));
        }

        if (extractedToken) localStorage.setItem('wf_ims_token', extractedToken);
        if (extractedHost) localStorage.setItem('wf_hostname', extractedHost);

        if (!extractedToken) throw new Error('Missing IMS Token in Workfront session.');
        if (!extractedId) throw new Error('No Context ID found. Please open this tab from a Workfront Project or Issue.');

        setObjID(extractedId);
        setObjCode(extractedCode);
        setHostname(extractedHost);
        setImsToken(extractedToken);

        await fetchMetrics(extractedId, extractedCode, extractedHost, extractedToken, 540, 'ALL');
      } catch (err) {
        console.error('App UIX Error:', err);
        setError(err.message);
        setLoading(false);
      }
    }

    initUIX();
  }, []);

  useEffect(() => {
    if (timelineScrollRef.current && data?.clickData?.length > 0) {
      setTimeout(() => {
        if (timelineScrollRef.current) timelineScrollRef.current.scrollLeft = timelineScrollRef.current.scrollWidth;
      }, 50);
    }
    if (qrTimelineScrollRef.current && data?.qrData?.scanData?.length > 0) {
      setTimeout(() => {
        if (qrTimelineScrollRef.current) qrTimelineScrollRef.current.scrollLeft = qrTimelineScrollRef.current.scrollWidth;
      }, 50);
    }
  }, [data, dateRange]);

  const fetchMetrics = async (id, code, host, token, units, reqId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/v1/web/workfront-ui-1/generic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objID: id, objCode: code, hostname: host, imsToken: token, units, selectedRequest: reqId })
      });
      const result = await response.json();
      const payload = result.body || result;

      if (!payload.hasLink) {
        setError(payload.message || 'No Bitly IDs assigned.');
      } else {
        setData(payload);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (e) => {
    const newUnits = Number(e.target.value);
    setDateRange(newUnits);
    if (hostname && imsToken) fetchMetrics(objID, objCode, hostname, imsToken, newUnits, selectedRequest);
  };

  const handleRequestChange = (e) => {
    const newReqId = e.target.value;
    setSelectedRequest(newReqId);
    if (hostname && imsToken) fetchMetrics(objID, objCode, hostname, imsToken, dateRange, newReqId);
  };

  // --- CSV Download Helper ---
  const handleDownloadCSV = (dataArray, filename) => {
    if (!dataArray || dataArray.length === 0) return;

    const headers = Object.keys(dataArray[0]);
    const csvRows = [];
    
    csvRows.push(headers.join(','));

    dataArray.forEach(row => {
      const values = headers.map(header => {
        const val = row[header] === null || row[header] === undefined ? '' : row[header];
        return `"${String(val).replace(/"/g, '""')}"`; 
      });
      csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Image Capture Helper ---
  const handleExportImage = async () => {
    if (dashboardRef.current) {
      try {
        const canvas = await html2canvas(dashboardRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#f9fafb'
        });
        const image = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = image;
        a.download = `Bitly_Metrics_Report_${dateRange}days.png`;
        a.click();
      } catch (err) {
        console.error("Error capturing image:", err);
      }
    }
  };

  // --- PDF Capture Helper ---
  const handleExportPDF = async () => {
    if (dashboardRef.current) {
      try {
        const canvas = await html2canvas(dashboardRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#f9fafb'
        });
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Bitly_Metrics_Report_${dateRange}days.pdf`);
      } catch (err) {
        console.error("Error generating PDF:", err);
      }
    }
  };

  // Reusable CSV Button Component
  const CsvButton = ({ dataArray, filename, color = CVS_RED }) => (
    <button 
      onClick={() => handleDownloadCSV(dataArray, filename)}
      style={{ background: 'none', border: `1px solid ${color}`, borderRadius: '4px', padding: '4px 12px', fontSize: '12px', color: color, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}
      title="Download raw data as CSV"
    >
      📥 CSV
    </button>
  );

  if (loading && !data) return <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>Loading Bitly Analytics...</div>;
  if (error) return <div style={{ padding: '24px', fontFamily: 'sans-serif', color: CVS_RED }}>{error}</div>;

  const clickData = data?.clickData || [];
  const countries = data?.countries || [];
  const cities = data?.cities || [];
  const referrers = data?.referrers || [];
  const devices = data?.devices || [];

  const qrTotalScans = data?.qrData?.totalScans || 0;
  const qrScanData = data?.qrData?.scanData || [];
  const qrCountries = data?.qrData?.countries || [];
  const qrCities = data?.qrData?.cities || [];
  const qrBrowsers = data?.qrData?.browsers || [];
  const qrOs = data?.qrData?.os || [];

  const hasBitlinks = data?.totalClicks > 0 || clickData.length > 0 || (data?.availableRequests && data.availableRequests.some(r => r.bitlinkId));
  const hasQrCodes = qrTotalScans > 0 || qrScanData.length > 0 || (data?.availableRequests && data.availableRequests.some(r => r.qrCodeId));

  const activeReq = selectedRequest !== 'ALL' 
    ? data?.availableRequests?.find(r => r.id === selectedRequest) 
    : data?.availableRequests?.[0];

  const bitlinkMeta = activeReq?.bitlinkId 
    ? data?.metadata?.[activeReq.bitlinkId] 
    : (data?.metadata ? Object.values(data.metadata)[0] : null);

  const qrMeta = activeReq?.qrCodeId 
    ? data?.qrData?.metadata?.[activeReq.qrCodeId] 
    : (data?.qrData?.metadata ? Object.values(data.qrData.metadata)[0] : null);

  const isMultiProjectView = data?.isProject && selectedRequest === 'ALL';
  const showAssetDetails = !isMultiProjectView && (bitlinkMeta || qrMeta);

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      
      {/* Global Filters & Export Actions */}
      <div style={{ backgroundColor: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        
        {/* Export Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleExportImage} style={{ padding: '8px 16px', borderRadius: '6px', border: `1px solid ${CVS_RED}`, backgroundColor: CVS_RED, fontSize: '13px', fontWeight: 'bold', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 4px rgba(204,0,0,0.2)' }}>
            🖼️ Export Image
          </button>
          <button onClick={handleExportPDF} style={{ padding: '8px 16px', borderRadius: '6px', border: `1px solid ${CVS_RED}`, backgroundColor: '#fff', fontSize: '13px', fontWeight: 'bold', color: CVS_RED, cursor: 'pointer' }}>
            📄 Export PDF
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {data?.isProject && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f3f4f6', padding: '6px 12px', borderRadius: '6px' }}>
              <label style={{ fontSize: '12px', color: '#4b5563', fontWeight: 'bold' }}>Request:</label>
              <select 
                value={selectedRequest} 
                onChange={handleRequestChange}
                disabled={loading}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '13px', fontWeight: '600', color: CVS_BLACK, cursor: 'pointer', outline: 'none', maxWidth: '200px' }}
              >
                <option value="ALL">All Requests</option>
                {data?.availableRequests?.map(req => (
                  <option key={req.id} value={req.id}>{req.ref} {req.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f3f4f6', padding: '6px 12px', borderRadius: '6px' }}>
            <label style={{ fontSize: '12px', color: '#4b5563', fontWeight: 'bold' }}>Timeframe:</label>
            <select 
              value={dateRange} 
              onChange={handleDateRangeChange}
              disabled={loading}
              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '13px', fontWeight: '600', color: CVS_BLACK, cursor: 'pointer', outline: 'none' }}
            >
              <option value={30}>Past 30 Days</option>
              <option value={90}>Past 90 Days</option>
              <option value={180}>Past 6 Months</option>
              <option value={365}>Past 1 Year</option>
              <option value={540}>Past 18 Months</option>
            </select>
          </div>
        </div>
      </div>

      {/* DASHBOARD CAPTURE WRAPPER */}
      <div ref={dashboardRef} style={{ backgroundColor: '#f9fafb', padding: '1px' }}>
        
        {/* 1. KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: hasBitlinks && hasQrCodes ? '1fr 1fr 1fr' : '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
          {hasBitlinks ? (
            <div style={{ flex: 1, padding: '24px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>TOTAL CLICKS</span>
              <div style={{ fontSize: '36px', fontWeight: '900', marginTop: '8px', color: CVS_RED }}>{data?.totalClicks?.toLocaleString() || 0}</div>
            </div>
          ) : null}

          {hasQrCodes ? (
            <div style={{ flex: 1, padding: '24px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>TOTAL QR SCANS</span>
              <div style={{ fontSize: '36px', fontWeight: '900', marginTop: '8px', color: CVS_BLACK }}>{qrTotalScans?.toLocaleString() || 0}</div>
            </div>
          ) : null}

          <div style={{ flex: 1, padding: '24px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
              {data?.isProject ? 'TRACKED LINKS' : 'SHORT LINK / ID'}
            </span>
            <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '12px', color: CVS_BLACK }}>
              {data?.isProject && selectedRequest === 'ALL' ? (
                 data?.shortUrl
              ) : (
                 <a href={data?.shortUrl?.startsWith('http') ? data.shortUrl : `https://${data?.shortUrl}`} target="_blank" rel="noreferrer" style={{ color: CVS_RED, textDecoration: 'underline', textUnderlineOffset: '4px' }}>
                   {data?.shortUrl}
                 </a>
              )}
            </div>
          </div>
        </div>

        {/* 2. Metadata Asset Summary */}
        {showAssetDetails && (
          <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '32px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', color: CVS_BLACK, fontWeight: '800' }}>Asset Details</h3>
            
            {(!bitlinkMeta && !qrMeta) ? (
              <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>No Bitly metadata available.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: bitlinkMeta && qrMeta ? '1fr 1fr' : '1fr', gap: '24px' }}>
                
                {bitlinkMeta && (
                  <div>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: CVS_RED, fontWeight: 'bold', textTransform: 'uppercase' }}>Shortlink Information</h4>
                    <p style={{ margin: '6px 0', fontSize: '14px' }}><strong>Title:</strong> {bitlinkMeta.title}</p>
                    <p style={{ margin: '6px 0', fontSize: '14px' }}><strong>Created:</strong> {bitlinkMeta.createdAt ? new Date(bitlinkMeta.createdAt).toLocaleDateString() : 'Unknown'}</p>
                    <p style={{ margin: '6px 0', fontSize: '14px' }}>
                      <strong>Destination:</strong>{' '}
                      {bitlinkMeta.longUrl ? (
                        <a href={bitlinkMeta.longUrl.startsWith('http') ? bitlinkMeta.longUrl : `https://${bitlinkMeta.longUrl}`} target="_blank" rel="noreferrer" style={{color: CVS_RED, wordBreak: 'break-all'}}>
                          {bitlinkMeta.longUrl}
                        </a>
                      ) : (
                        <span style={{color: '#6b7280'}}>Unknown</span>
                      )}
                    </p>
                    {bitlinkMeta.tags?.length > 0 && (
                      <p style={{ margin: '6px 0', fontSize: '14px' }}><strong>Tags:</strong> {bitlinkMeta.tags.join(', ')}</p>
                    )}
                  </div>
                )}

                {qrMeta && (
                  <div style={bitlinkMeta && qrMeta ? { borderLeft: '1px solid #e5e7eb', paddingLeft: '24px' } : {}}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: CVS_BLACK, fontWeight: 'bold', textTransform: 'uppercase' }}>QR Code Information</h4>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      {qrMeta.imageUrl && (
                        <div style={{ flexShrink: 0 }}>
                          <img src={qrMeta.imageUrl} alt="QR Code" style={{ width: '120px', height: '120px', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '4px', backgroundColor: '#fff' }} />
                        </div>
                      )}
                      <div style={{ overflow: 'hidden' }}>
                        <p style={{ margin: '0 0 6px 0', fontSize: '14px' }}><strong>Title:</strong> {qrMeta.title}</p>
                        <p style={{ margin: '6px 0', fontSize: '14px' }}><strong>Created:</strong> {qrMeta.createdAt ? new Date(qrMeta.createdAt).toLocaleDateString() : 'Unknown'}</p>
                        <p style={{ margin: '6px 0', fontSize: '14px' }}>
                          <strong>Target:</strong>{' '}
                          {qrMeta.longUrl ? (
                            <a href={qrMeta.longUrl.startsWith('http') ? qrMeta.longUrl : `https://${qrMeta.longUrl}`} target="_blank" rel="noreferrer" style={{color: CVS_RED, wordBreak: 'break-all'}}>
                              {qrMeta.longUrl}
                            </a>
                          ) : (
                            <span style={{color: '#6b7280'}}>Unknown</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        )}

        {/* =========================================
            BITLINK METRICS SECTION
        ========================================= */}
        {hasBitlinks ? (
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{ fontSize: '20px', color: CVS_BLACK, margin: '16px 0 24px 0', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '4px', height: '24px', backgroundColor: CVS_RED, display: 'inline-block', borderRadius: '2px' }}></span>
              Shortlink Click Analytics
            </h2>
            
            <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: CVS_BLACK }}>Clicks over time</h3>
                <CsvButton dataArray={clickData} filename={`clicks_timeline_${dateRange}days`} color={CVS_RED} />
              </div>
              <div ref={timelineScrollRef} style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
                <div key={`bitlink-${dateRange}-${selectedRequest}`} style={{ width: `max(100%, ${clickData.length * 35}px)`, height: '280px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={clickData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="date" interval={clickData.length > 30 ? 0 : 'preserveStartEnd'} angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11, fill: '#6b7280', fontWeight: '600' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280', fontWeight: '600' }} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Line type="monotone" dataKey="clicks" stroke={CVS_RED} strokeWidth={4} dot={{ r: 4, fill: CVS_RED, strokeWidth: 0 }} activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
                <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: CVS_BLACK }}>Locations</h3>
                    <CsvButton dataArray={locationTab === 'countries' ? countries : cities} filename={`click_locations_${locationTab}`} color={CVS_RED} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #f3f4f6', marginBottom: '16px' }}>
                    <button onClick={() => setLocationTab('countries')} style={{ background: 'none', border: 'none', padding: '8px 12px', fontSize: '14px', fontWeight: locationTab === 'countries' ? 'bold' : '600', color: locationTab === 'countries' ? CVS_RED : '#9ca3af', borderBottom: locationTab === 'countries' ? `3px solid ${CVS_RED}` : '3px solid transparent', cursor: 'pointer', transition: 'all 0.2s' }}>Countries</button>
                    <button onClick={() => setLocationTab('cities')} style={{ background: 'none', border: 'none', padding: '8px 12px', fontSize: '14px', fontWeight: locationTab === 'cities' ? 'bold' : '600', color: locationTab === 'cities' ? CVS_RED : '#9ca3af', borderBottom: locationTab === 'cities' ? `3px solid ${CVS_RED}` : '3px solid transparent', cursor: 'pointer', transition: 'all 0.2s' }}>Cities</button>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                        <th style={{ paddingBottom: '8px', fontWeight: '600' }}>{locationTab === 'countries' ? 'Country' : 'City'}</th>
                        <th style={{ paddingBottom: '8px', textAlign: 'right', fontWeight: '600' }}>Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locationTab === 'countries' ? (
                        countries.length > 0 ? countries.map((loc, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                            <td style={{ padding: '10px 0', fontWeight: '500' }}>{loc.country}</td>
                            <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '800', color: CVS_BLACK }}>{loc.clicks.toLocaleString()}</td>
                          </tr>
                        )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No country data available</td></tr>
                      ) : (
                        cities.length > 0 ? cities.map((city, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                            <td style={{ padding: '10px 0', fontWeight: '500' }}>{city.city}{city.country ? `, ${city.country}` : ''}</td>
                            <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '800', color: CVS_BLACK }}>{city.clicks.toLocaleString()}</td>
                          </tr>
                        )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No city data available</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: CVS_BLACK }}>Referrers</h3>
                    <CsvButton dataArray={referrers} filename="click_referrers" color={CVS_RED} />
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                        <th style={{ paddingBottom: '8px', fontWeight: '600' }}>Referrer</th>
                        <th style={{ paddingBottom: '8px', textAlign: 'right', fontWeight: '600' }}>Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrers.length > 0 ? referrers.map((ref, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                          <td style={{ padding: '10px 0', fontWeight: '500' }}>{ref.referrer}</td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '800', color: CVS_BLACK }}>{ref.clicks.toLocaleString()}</td>
                        </tr>
                      )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No referrer data available</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', minWidth: 0, boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: CVS_BLACK }}>Devices</h3>
                  <CsvButton dataArray={devices} filename="click_devices" color={CVS_RED} />
                </div>
                <div style={{ width: '100%', height: '320px' }}>
                  <ResponsiveContainer key={`devices-${dateRange}-${selectedRequest}`} width="100%" height="100%">
                    <BarChart data={devices} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="device" tick={{ fontSize: 12, fill: CVS_BLACK, fontWeight: '600' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Bar dataKey="clicks" fill={CVS_RED} radius={[6, 6, 0, 0]} barSize={50} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* =========================================
            QR CODE METRICS SECTION
        ========================================= */}
        {hasQrCodes ? (
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{ fontSize: '20px', color: CVS_BLACK, margin: hasBitlinks ? '48px 0 24px 0' : '16px 0 24px 0', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '4px', height: '24px', backgroundColor: CVS_BLACK, display: 'inline-block', borderRadius: '2px' }}></span>
              QR Code Metrics
            </h2>

            <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: CVS_BLACK }}>Scans over time</h3>
                <CsvButton dataArray={qrScanData} filename={`scans_timeline_${dateRange}days`} color={CVS_BLACK} />
              </div>
              <div ref={qrTimelineScrollRef} style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
                <div key={`qr-${dateRange}-${selectedRequest}`} style={{ width: `max(100%, ${qrScanData.length * 35}px)`, height: '280px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={qrScanData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                      <XAxis dataKey="date" interval={qrScanData.length > 30 ? 0 : 'preserveStartEnd'} angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11, fill: '#6b7280', fontWeight: '600' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280', fontWeight: '600' }} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                      <Line type="monotone" dataKey="scans" stroke={CVS_BLACK} strokeWidth={4} dot={{ r: 4, fill: CVS_BLACK, strokeWidth: 0 }} activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
                <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: CVS_BLACK }}>QR Scans by Location</h3>
                    <CsvButton dataArray={qrLocationTab === 'countries' ? qrCountries : qrCities} filename={`scan_locations_${qrLocationTab}`} color={CVS_BLACK} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #f3f4f6', marginBottom: '16px' }}>
                    <button onClick={() => setQrLocationTab('countries')} style={{ background: 'none', border: 'none', padding: '8px 12px', fontSize: '14px', fontWeight: qrLocationTab === 'countries' ? 'bold' : '600', color: qrLocationTab === 'countries' ? CVS_BLACK : '#9ca3af', borderBottom: qrLocationTab === 'countries' ? `3px solid ${CVS_BLACK}` : '3px solid transparent', cursor: 'pointer', transition: 'all 0.2s' }}>Countries</button>
                    <button onClick={() => setQrLocationTab('cities')} style={{ background: 'none', border: 'none', padding: '8px 12px', fontSize: '14px', fontWeight: qrLocationTab === 'cities' ? 'bold' : '600', color: qrLocationTab === 'cities' ? CVS_BLACK : '#9ca3af', borderBottom: qrLocationTab === 'cities' ? `3px solid ${CVS_BLACK}` : '3px solid transparent', cursor: 'pointer', transition: 'all 0.2s' }}>Cities</button>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                        <th style={{ paddingBottom: '8px', fontWeight: '600' }}>{qrLocationTab === 'countries' ? 'Country' : 'City'}</th>
                        <th style={{ paddingBottom: '8px', textAlign: 'right', fontWeight: '600' }}>Scans</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qrLocationTab === 'countries' ? (
                        qrCountries.length > 0 ? qrCountries.map((loc, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                            <td style={{ padding: '10px 0', fontWeight: '500' }}>{loc.country}</td>
                            <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '800', color: CVS_BLACK }}>{loc.scans.toLocaleString()}</td>
                          </tr>
                        )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No country data available</td></tr>
                      ) : (
                        qrCities.length > 0 ? qrCities.map((city, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                            <td style={{ padding: '10px 0', fontWeight: '500' }}>{city.city}{city.country ? `, ${city.country}` : ''}</td>
                            <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '800', color: CVS_BLACK }}>{city.scans.toLocaleString()}</td>
                          </tr>
                        )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No city data available</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: CVS_BLACK }}>QR Scans by Browser</h3>
                    <CsvButton dataArray={qrBrowsers} filename="scan_browsers" color={CVS_BLACK} />
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                        <th style={{ paddingBottom: '8px', fontWeight: '600' }}>Browser</th>
                        <th style={{ paddingBottom: '8px', textAlign: 'right', fontWeight: '600' }}>Scans</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qrBrowsers.length > 0 ? qrBrowsers.map((b, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                          <td style={{ padding: '10px 0', fontWeight: '500' }}>{b.browser}</td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '800', color: CVS_BLACK }}>{b.scans.toLocaleString()}</td>
                        </tr>
                      )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No browser data available</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
                <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', minWidth: 0, boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: CVS_BLACK }}>QR Scans by Operating System</h3>
                    <CsvButton dataArray={qrOs} filename="scan_os" color={CVS_BLACK} />
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                        <th style={{ paddingBottom: '8px', fontWeight: '600' }}>Operating System</th>
                        <th style={{ paddingBottom: '8px', textAlign: 'right', fontWeight: '600' }}>Scans</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qrOs.length > 0 ? qrOs.map((o, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f9fafb' }}>
                          <td style={{ padding: '10px 0', fontWeight: '500' }}>{o.operatingSystem}</td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '800', color: CVS_BLACK }}>{o.scans.toLocaleString()}</td>
                        </tr>
                      )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No OS data available</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}