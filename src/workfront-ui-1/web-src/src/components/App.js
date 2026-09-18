import React, { useEffect, useState, useRef } from 'react';
import { attach } from '@adobe/uix-guest';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import metadata from '../../../../app-metadata.json'; 

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

  const timelineScrollRef = useRef(null);

  useEffect(() => {
    async function initUIX() {
      try {
        const conn = await attach({ id: metadata.name });

        let extractedToken = null;
        let extractedHost = window.location.hostname;
        let extractedId = null;
        let extractedCode = 'OPTASK';

        // Poll sharedContext for up to 3 seconds for iframe postMessage hydration
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

        if (!extractedToken) {
          throw new Error('Missing IMS Token in Workfront session.');
        }

        if (!extractedId) {
          throw new Error('No Context ID found. Please open this tab from a Workfront Project or Issue.');
        }

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
      const timer = setTimeout(() => {
        if (timelineScrollRef.current) {
          timelineScrollRef.current.scrollLeft = timelineScrollRef.current.scrollWidth;
        }
      }, 50);
      return () => clearTimeout(timer);
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
        setError(payload.message || 'No Bitly Shortlinks assigned.');
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

  if (loading && !data) return <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>Loading Bitly Analytics...</div>;
  if (error) return <div style={{ padding: '24px', fontFamily: 'sans-serif', color: '#dc2626' }}>{error}</div>;

  const clickData = data?.clickData || [];
  const countries = data?.countries || [];
  const cities = data?.cities || [];
  const referrers = data?.referrers || [];
  const devices = data?.devices || [];

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div style={{ flex: 1, padding: '20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', letterSpacing: '0.5px' }}>TOTAL ENGAGEMENTS</span>
          <div style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '4px', color: '#111827' }}>{data?.totalClicks || 0}</div>
        </div>
        <div style={{ flex: 1, padding: '20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'bold', letterSpacing: '0.5px' }}>
            {data?.isProject ? 'TRACKED LINKS' : 'SHORT LINK'}
          </span>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '8px', color: data?.isProject && selectedRequest === 'ALL' ? '#111827' : '#2563eb' }}>
            {data?.isProject && selectedRequest === 'ALL' ? (
               data?.shortUrl
            ) : (
               <a href={data?.shortUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>{data?.shortUrl}</a>
            )}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#111827' }}>Engagements over time</h3>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {data?.isProject && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f3f4f6', padding: '4px 10px', borderRadius: '6px' }}>
                <label style={{ fontSize: '12px', color: '#4b5563', fontWeight: 'bold' }}>Request:</label>
                <select 
                  value={selectedRequest} 
                  onChange={handleRequestChange}
                  disabled={loading}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '13px', fontWeight: '600', color: '#1f2937', cursor: 'pointer', outline: 'none', maxWidth: '200px' }}
                >
                  <option value="ALL">All Requests</option>
                  {data?.availableRequests?.map(req => (
                    <option key={req.id} value={req.id}>{req.ref} - {req.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f3f4f6', padding: '4px 10px', borderRadius: '6px' }}>
              <label style={{ fontSize: '12px', color: '#4b5563', fontWeight: 'bold' }}>Timeframe:</label>
              <select 
                value={dateRange} 
                onChange={handleDateRangeChange}
                disabled={loading}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', fontSize: '13px', fontWeight: '600', color: '#1f2937', cursor: 'pointer', outline: 'none' }}
              >
                <option value={30}>Past 30 Days</option>
                <option value={90}>Past 90 Days</option>
                <option value={180}>Past 6 Months</option>
                <option value={365}>Past 1 Year</option>
                <option value={540}>Past 18 Months</option>
                <option value={730}>Past 2 Years</option>
              </select>
            </div>
          </div>
        </div>

        <div ref={timelineScrollRef} style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden', borderBottom: '1px solid #f3f4f6', paddingBottom: '8px' }}>
          <div key={`${dateRange}-${selectedRequest}`} style={{ width: `max(100%, ${clickData.length * 35}px)`, height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={clickData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" interval={clickData.length > 30 ? 0 : 'preserveStartEnd'} angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                <Tooltip />
                <Line type="monotone" dataKey="clicks" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {clickData.length > 30 && (
          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', textAlign: 'right' }}>← Scroll left to view older dates</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Locations</h3>
            <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #e5e7eb', marginBottom: '12px' }}>
              <button onClick={() => setLocationTab('countries')} style={{ background: 'none', border: 'none', padding: '8px 0', fontSize: '14px', fontWeight: locationTab === 'countries' ? 'bold' : 'normal', color: locationTab === 'countries' ? '#2563eb' : '#6b7280', borderBottom: locationTab === 'countries' ? '2px solid #2563eb' : 'none', cursor: 'pointer' }}>Countries</button>
              <button onClick={() => setLocationTab('cities')} style={{ background: 'none', border: 'none', padding: '8px 0', fontSize: '14px', fontWeight: locationTab === 'cities' ? 'bold' : 'normal', color: locationTab === 'cities' ? '#2563eb' : '#6b7280', borderBottom: locationTab === 'cities' ? '2px solid #2563eb' : 'none', cursor: 'pointer' }}>Cities</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={{ paddingBottom: '8px' }}>{locationTab === 'countries' ? 'Country' : 'City'}</th>
                  <th style={{ paddingBottom: '8px', textAlign: 'right' }}>Engagements</th>
                </tr>
              </thead>
              <tbody>
                {locationTab === 'countries' ? (
                  countries.length > 0 ? countries.map((loc, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 0' }}>{loc.country}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold' }}>{loc.clicks}</td>
                    </tr>
                  )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No country data available</td></tr>
                ) : (
                  cities.length > 0 ? cities.map((city, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 0' }}>{city.city}{city.country ? `, ${city.country}` : ''}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold' }}>{city.clicks}</td>
                    </tr>
                  )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No city data available</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Referrers</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={{ paddingBottom: '8px' }}>Referrer</th>
                  <th style={{ paddingBottom: '8px', textAlign: 'right' }}>Engagements</th>
                </tr>
              </thead>
              <tbody>
                {referrers.length > 0 ? referrers.map((ref, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 0' }}>{ref.referrer}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold' }}>{ref.clicks}</td>
                  </tr>
                )) : <tr><td colSpan="2" style={{ padding: '12px 0', color: '#9ca3af' }}>No referrer data available</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', minWidth: 0 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Devices</h3>
          <div style={{ width: '100%', height: '320px' }}>
            <ResponsiveContainer key={`${dateRange}-${selectedRequest}`} width="100%" height="100%">
              <BarChart data={devices} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="device" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="clicks" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}