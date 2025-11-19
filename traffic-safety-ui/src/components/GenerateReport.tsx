import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import { reportsApi, PostEventReportRequest } from '../api/reports';
import { weatherApi, WeatherRecord } from '../api/weather';

const GenerateReport: React.FC = () => {
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [emergencyEvents, setEmergencyEvents] = useState<any[]>([]);
  const [weather, setWeather] = useState<WeatherRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<'draft' | 'finalized' | 'closed' | null>(null);
  const [showReportList, setShowReportList] = useState(false);
  const [allReports, setAllReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<PostEventReportRequest>({
    emergency_type: 'Real',
    event_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    activation_911: 'Unknown',
    observations: [],
    sequence_of_events: [],
    ecc_notes: [],
    responder_actions: [],
    ecc_actions: [],
    sa_affairs_actions: []
  });

  // Load emergency events on mount
  useEffect(() => {
    loadEmergencyEvents();
    loadWeather();
    loadAllReports();
  }, []);

  const loadAllReports = async () => {
    setLoadingReports(true);
    try {
      const reports = await reportsApi.listReports();
      setAllReports(reports);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoadingReports(false);
    }
  };

  const loadReportData = async (reportIdToLoad: string) => {
    try {
      const report = await reportsApi.getReport(reportIdToLoad);
      setReportId(report.id);
      setReportStatus(report.status);
      
      // Populate form with report data
      const reportData = report.report_data;
      const emergency = reportData.emergency || {};
      const incidentManager = reportData.incident_manager || {};
      const incidentCommander = reportData.incident_commander || {};
      const effects = reportData.effects || {};
      const injuries = reportData.injuries || {};
      const checklists = reportData.checklists || {};
      
      // Extract start_time and end_time from sequence_of_events
      const sequenceOfEvents = reportData.sequence_of_events || [];
      const start_time = sequenceOfEvents.length > 0 ? sequenceOfEvents[0].time || '' : '';
      const end_time = sequenceOfEvents.length > 0 ? sequenceOfEvents[sequenceOfEvents.length - 1].time || '' : '';
      
      setFormData({
        event_id: report.event_id,
        emergency_type: emergency.type || 'Real',
        event_date: emergency.date || '',
        start_time: start_time,
        end_time: end_time,
        location: emergency.location || '',
        subject: emergency.subject || '',
        description: emergency.description || '',
        activation_scenario: emergency.description || '',
        activation_911: emergency.activation_911 || 'Unknown',
        incident_manager_name: incidentManager.name || '',
        incident_manager_login_id: incidentManager.login_id || '',
        incident_manager_organization: incidentManager.organization || '',
        incident_manager_badge_id: incidentManager.badge_id || '',
        incident_commander_name: incidentCommander.name || '',
        incident_commander_login_id: incidentCommander.login_id || '',
        incident_commander_division: incidentCommander.division || '',
        incident_commander_badge_id: incidentCommander.badge_id || '',
        observations: reportData.observations || [],
        sequence_of_events: sequenceOfEvents,
        ecc_notes: reportData.ecc_notes || [],
        properties_affected: effects.properties_affected || '',
        production_effectiveness: effects.production_effectiveness || '',
        data_exported_at: effects.data_exported_at || '',
        comments: effects.comments || '',
        injuries_number: injuries.number,
        injuries_type: injuries.type,
        responder_actions: checklists.responder_actions || [],
        ecc_actions: checklists.ecc_actions || [],
        sa_affairs_actions: checklists.sa_affairs_actions || []
      });
      
      setShowReportList(false);
    } catch (error) {
      console.error('Failed to load report:', error);
      alert('Failed to load report data');
    }
  };

  // Load event data when selected
  useEffect(() => {
    if (selectedEventId) {
      loadEventData(selectedEventId);
    }
  }, [selectedEventId]);

  const loadEmergencyEvents = async () => {
    try {
      const response = await apiClient.get('/emergency-events/');
      setEmergencyEvents(response.data);
    } catch (error) {
      console.error('Failed to load emergency events:', error);
    }
  };

  const loadWeather = async () => {
    try {
      const latest = await weatherApi.latest();
      setWeather(latest);
    } catch (error) {
      console.error('Failed to load weather:', error);
    }
  };

  const loadEventData = async (eventId: number) => {
    try {
      const data = await reportsApi.getEventData(eventId);
      if (data.event) {
        const event = data.event;
        
        // Convert time format from HH:MM:SS to HH:MM if needed
        const formatTime = (timeStr: string | null) => {
          if (!timeStr) return '';
          // If time is in HH:MM:SS format, extract HH:MM
          if (timeStr.includes(':')) {
            const parts = timeStr.split(':');
            return `${parts[0]}:${parts[1]}`;
          }
          return timeStr;
        };
        
        setFormData(prev => ({
          ...prev,
          event_id: eventId,
          // Auto-populate date, start time, and end time from event
          event_date: event.activation_date || prev.event_date,
          start_time: formatTime(event.activation_time) || prev.start_time,
          end_time: formatTime(event.clear_time) || prev.end_time,
          activation_scenario: data.activation_scenario || prev.activation_scenario,
          location: `ABGOSP-6 - ${event.zone_name}` || prev.location
        }));
      }
      if (data.weather) {
        setWeather(data.weather as any);
      }
    } catch (error) {
      console.error('Failed to load event data:', error);
    }
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const response = await reportsApi.generateReport(formData);
      setReportId(response.report_id);
      setReportStatus(response.status);
      
      if (response.missing_fields.length > 0) {
        alert(`Report created as draft. Missing fields: ${response.missing_fields.map(f => f.path).join(', ')}`);
      } else {
        alert('Report generated successfully!');
      }
      
      // Reload reports list
      await loadAllReports();
    } catch (error: any) {
      console.error('Failed to generate report:', error);
      alert(`Failed to generate report: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseReport = async () => {
    if (!reportId) return;
    
    if (!confirm('Are you sure you want to close this report? It cannot be edited after closing.')) {
      return;
    }

    try {
      await reportsApi.closeReport(reportId);
      setReportStatus('closed');
      alert('Report closed successfully!');
      
      // Reload reports list
      await loadAllReports();
    } catch (error: any) {
      console.error('Failed to close report:', error);
      alert(`Failed to close report: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleExportPDF = async () => {
    if (!reportId) {
      alert('Please generate a report first before exporting.');
      return;
    }
    
    try {
      setLoading(true);
      const blob = await reportsApi.exportPDF(reportId);
      
      // Check if blob is valid
      if (!blob || blob.size === 0) {
        throw new Error('Received empty PDF file');
      }
      
      // Check if it's actually a PDF (check first few bytes)
      const blobType = blob.type || 'application/pdf';
      if (!blobType.includes('pdf') && !blobType.includes('octet-stream')) {
        // Try to read first bytes to verify
        const firstBytes = await blob.slice(0, 4).arrayBuffer();
        const pdfSignature = new Uint8Array(firstBytes);
        // PDF files start with %PDF
        if (pdfSignature[0] !== 0x25 || 
            String.fromCharCode(pdfSignature[1]) !== 'P' ||
            String.fromCharCode(pdfSignature[2]) !== 'D' ||
            String.fromCharCode(pdfSignature[3]) !== 'F') {
          throw new Error('Invalid PDF file received');
        }
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `emergency-report-${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('PDF exported successfully!');
    } catch (error: any) {
      console.error('Failed to export PDF:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Unknown error';
      alert(`Failed to export PDF: ${errorMessage}\n\nPlease ensure reportlab is installed: pip install reportlab`);
    } finally {
      setLoading(false);
    }
  };

  const addObservation = () => {
    setFormData(prev => ({
      ...prev,
      observations: [...prev.observations, {
        rank: prev.observations.length + 1,
        observation: '',
        priority: 'Unknown',
        recommendation: '',
        recommendation_classification: 'Unknown'
      }]
    }));
  };

  const updateObservation = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      observations: prev.observations.map((obs, i) => 
        i === index ? { ...obs, [field]: value } : obs
      )
    }));
  };

  const addSequenceEvent = () => {
    setFormData(prev => ({
      ...prev,
      sequence_of_events: [...prev.sequence_of_events, {
        time: '',
        event: '',
        attended_in_icp: '',
        login_id: '',
        organization: ''
      }]
    }));
  };

  const updateSequenceEvent = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      sequence_of_events: prev.sequence_of_events.map((evt, i) => 
        i === index ? { ...evt, [field]: value } : evt
      )
    }));
  };

  const addECCNote = () => {
    setFormData(prev => ({
      ...prev,
      ecc_notes: [...prev.ecc_notes, '']
    }));
  };

  const updateECCNote = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      ecc_notes: prev.ecc_notes.map((note, i) => i === index ? value : note)
    }));
  };

  // Checklist items (from the provided documentation)
  const responderChecklistItems = [
    "Operations and/or Fire Protection rescues victims, move to safe area, and apply CPR as needed.",
    "Medical applies first aid, stabilizes victims and transports to medical facility.",
    "Security controls traffic and access to scene.",
    "Fire Protection controls fire, if any.",
    "Other responding organizations report to IC."
  ];

  const eccChecklistItems = [
    "First in ECC calls staff to report to ECC.",
    "Informs management of the incident.",
    "Activates the Emergency Message Board.",
    "Verifies that all key Department heads have been informed.",
    "Verifies that emergency support received 911 call.",
    "Establishes contact with IC.",
    "Calls support service organizations to respond or be on standby.",
    "Establishes an accounting code to accumulate charges.",
    "For Well/Field emergency, contacts other involved Department.",
    "For well/field emergency, contacts organizations to evacuate crews in the area.",
    "Contacts SA Affairs to report to ECC."
  ];

  const saAffairsChecklistItems = [
    "Coordinates with Public Relations for releases of information updates to media.",
    "Contacts government agencies for support (Police, Traffic Control, ISF, Civil Defense, Red Crescent).",
    "Contacts government agencies for information and their further action (Military, Hospitals, Governor or community leader, General Investigation)."
  ];

  const initializeChecklist = (items: string[], checklistType: 'responder' | 'ecc' | 'sa_affairs') => {
    const key = `${checklistType}_actions` as keyof PostEventReportRequest;
    setFormData(prev => ({
      ...prev,
      [key]: items.map(item => ({ item, answer: 'N/A' as const }))
    }));
  };

  const updateChecklistItem = (checklistType: 'responder' | 'ecc' | 'sa_affairs', index: number, answer: 'Yes' | 'No' | 'N/A') => {
    const key = `${checklistType}_actions` as keyof PostEventReportRequest;
    setFormData(prev => {
      const checklist = prev[key] as Array<{ item: string; answer: 'Yes' | 'No' | 'N/A' }>;
      return {
        ...prev,
        [key]: checklist.map((item, i) => i === index ? { ...item, answer } : item)
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Emergency Event Reporting</h1>
            <p className="text-gray-300 mt-1">North Ghawar Producing Department - Emergency Guidance System</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setShowReportList(!showReportList);
                if (!showReportList) {
                  loadAllReports();
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold transition-colors"
            >
              {showReportList ? 'New Report' : 'View Reports'}
            </button>
            <div className="text-sm text-yellow-400 bg-yellow-900 px-3 py-1 rounded-full">
              🚧 Under Development
            </div>
          </div>
        </div>
      </div>

      {/* Reports List View */}
      {showReportList && (
        <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Historical Reports</h2>
            <button
              onClick={loadAllReports}
              disabled={loadingReports}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm disabled:opacity-50"
            >
              {loadingReports ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          
          {loadingReports ? (
            <div className="text-center py-8 text-gray-400">Loading reports...</div>
          ) : allReports.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No reports found. Create your first report above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-white font-semibold">Report ID</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Event ID</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Status</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Created</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Closed</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allReports.map((report) => (
                    <tr key={report.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="px-4 py-3 text-gray-300 font-mono text-xs">{report.id.substring(0, 8)}...</td>
                      <td className="px-4 py-3 text-gray-300">{report.event_id || 'N/A'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          report.status === 'closed' ? 'bg-green-900 text-green-300' :
                          report.status === 'finalized' ? 'bg-blue-900 text-blue-300' :
                          'bg-yellow-900 text-yellow-300'
                        }`}>
                          {report.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {report.created_at ? new Date(report.created_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {report.closed_at ? new Date(report.closed_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => loadReportData(report.id)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                          >
                            View
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const blob = await reportsApi.exportPDF(report.id);
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `emergency-report-${report.id}.pdf`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (error: any) {
                                alert(`Failed to export PDF: ${error.message}`);
                              }
                            }}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Report Form View */}
      {!showReportList && (
        <>

      {/* Event Selection */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Select Emergency Event</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Emergency Event
            </label>
            <select
              value={selectedEventId || ''}
              onChange={(e) => setSelectedEventId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select an event...</option>
              {emergencyEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.zone_name} - {event.wind_direction} ({event.activation_date} {event.activation_time})
                </option>
              ))}
            </select>
          </div>
          
          {weather && (
            <div className="text-sm text-gray-300">
              <p><strong>Weather:</strong> {weather.temperature_c ? `${weather.temperature_c}°C` : 'N/A'}</p>
              <p><strong>Wind:</strong> {weather.wind_speed_ms ? `${weather.wind_speed_ms} m/s` : 'N/A'} 
                 {weather.wind_direction_deg ? ` @ ${Math.round(weather.wind_direction_deg)}°` : ''}</p>
            </div>
          )}
        </div>
      </div>

      {/* Emergency Event Information */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Emergency Event Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Emergency Type</label>
            <select
              value={formData.emergency_type}
              onChange={(e) => setFormData(prev => ({ ...prev, emergency_type: e.target.value as any }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            >
              <option value="Real">Real</option>
              <option value="Drill">Drill</option>
              <option value="Exercise">Exercise</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Event Date
              {selectedEventId && <span className="text-blue-400 text-xs ml-2">(from event)</span>}
            </label>
            <input
              type="date"
              value={formData.event_date}
              onChange={(e) => setFormData(prev => ({ ...prev, event_date: e.target.value }))}
              disabled={!!selectedEventId}
              className={`w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white ${
                selectedEventId ? 'opacity-60 cursor-not-allowed' : ''
              }`}
              title={selectedEventId ? 'Date is loaded from selected emergency event' : ''}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Start Time (HH:MM)
              {selectedEventId && <span className="text-blue-400 text-xs ml-2">(from event)</span>}
            </label>
            <input
              type="time"
              value={formData.start_time}
              onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
              disabled={!!selectedEventId}
              className={`w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white ${
                selectedEventId ? 'opacity-60 cursor-not-allowed' : ''
              }`}
              title={selectedEventId ? 'Start time is loaded from selected emergency event activation time' : ''}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              End Time (HH:MM)
              {selectedEventId && <span className="text-blue-400 text-xs ml-2">(from event)</span>}
            </label>
            <input
              type="time"
              value={formData.end_time || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
              disabled={!!selectedEventId && !!formData.end_time}
              className={`w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white ${
                selectedEventId && formData.end_time ? 'opacity-60 cursor-not-allowed' : ''
              }`}
              title={selectedEventId && formData.end_time ? 'End time is loaded from selected emergency event clear time' : ''}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Emergency Event Location</label>
            <input
              type="text"
              value={formData.location || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Event Subject</label>
            <input
              type="text"
              value={formData.subject || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">Activation Scenario</label>
            <input
              type="text"
              value={formData.activation_scenario || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, activation_scenario: e.target.value }))}
              placeholder="e.g., zone G wind south to north"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">Event Description (scenario)</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Click or tap here to enter text"
              rows={3}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">911 Activation</label>
            <select
              value={formData.activation_911}
              onChange={(e) => setFormData(prev => ({ ...prev, activation_911: e.target.value as any }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            >
              <option value="Yes">Yes</option>
              <option value="No">No</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
        </div>
      </div>

      {/* Incident Manager Information */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Incident Manager Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
            <input
              type="text"
              value={formData.incident_manager_name || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_manager_name: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Log-in ID</label>
            <input
              type="text"
              value={formData.incident_manager_login_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_manager_login_id: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Organization</label>
            <input
              type="text"
              value={formData.incident_manager_organization || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_manager_organization: e.target.value }))}
              placeholder="Choose an item"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Badge # (ID)</label>
            <input
              type="text"
              value={formData.incident_manager_badge_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_manager_badge_id: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
        </div>
      </div>

      {/* Incident Commander Information */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Incident Commander Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
            <input
              type="text"
              value={formData.incident_commander_name || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_commander_name: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Log-in ID</label>
            <input
              type="text"
              value={formData.incident_commander_login_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_commander_login_id: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">NGPD Division</label>
            <input
              type="text"
              value={formData.incident_commander_division || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_commander_division: e.target.value }))}
              placeholder="Choose an item"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Badge # (ID)</label>
            <input
              type="text"
              value={formData.incident_commander_badge_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_commander_badge_id: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
        </div>
      </div>

      {/* Emergency Observations Table */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Emergency Observation</h2>
          <button
            onClick={addObservation}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
          >
            + Add Observation
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-3 py-2 text-white">#</th>
                <th className="px-3 py-2 text-white">Emergency Observation</th>
                <th className="px-3 py-2 text-white">Rank</th>
                <th className="px-3 py-2 text-white">Emergency Recommendation</th>
                <th className="px-3 py-2 text-white">Classification</th>
              </tr>
            </thead>
            <tbody>
              {formData.observations.map((obs, index) => (
                <tr key={index} className="border-b border-gray-700">
                  <td className="px-3 py-2 text-gray-300">{obs.rank || index + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={obs.observation || ''}
                      onChange={(e) => updateObservation(index, 'observation', e.target.value)}
                      placeholder="Click or tap here to enter text"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={obs.priority}
                      onChange={(e) => updateObservation(index, 'priority', e.target.value)}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={obs.recommendation || ''}
                      onChange={(e) => updateObservation(index, 'recommendation', e.target.value)}
                      placeholder="Click or tap here to enter text"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={obs.recommendation_classification}
                      onChange={(e) => updateObservation(index, 'recommendation_classification', e.target.value)}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    >
                      <option value="Site Response">Site Response</option>
                      <option value="Area Response">Area Response</option>
                      <option value="Company Response">Company Response</option>
                      <option value="Other">Other</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  </td>
                </tr>
              ))}
              {formData.observations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                    No observations added. Click "Add Observation" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sequence of Events Table */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Sequence of Events Occurred at the Scene</h2>
          <button
            onClick={addSequenceEvent}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
          >
            + Add Event
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-3 py-2 text-white">Time</th>
                <th className="px-3 py-2 text-white">Event</th>
                <th className="px-3 py-2 text-white">Attended in the ICP</th>
                <th className="px-3 py-2 text-white">Log-in ID</th>
                <th className="px-3 py-2 text-white">Organization</th>
              </tr>
            </thead>
            <tbody>
              {formData.sequence_of_events.map((event, index) => (
                <tr key={index} className="border-b border-gray-700">
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={event.time || ''}
                      onChange={(e) => updateSequenceEvent(index, 'time', e.target.value)}
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={event.event || ''}
                      onChange={(e) => updateSequenceEvent(index, 'event', e.target.value)}
                      placeholder="Click or tap here to enter text"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={event.attended_in_icp || ''}
                      onChange={(e) => updateSequenceEvent(index, 'attended_in_icp', e.target.value)}
                      placeholder="Click or tap here to enter text"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={event.login_id || ''}
                      onChange={(e) => updateSequenceEvent(index, 'login_id', e.target.value)}
                      placeholder="Click or tap here to enter text"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={event.organization || ''}
                      onChange={(e) => updateSequenceEvent(index, 'organization', e.target.value)}
                      placeholder="Click or tap here to enter text"
                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs"
                    />
                  </td>
                </tr>
              ))}
              {formData.sequence_of_events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                    No events added. Click "Add Event" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ECC Notes */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Emergency Control Center (ECC) Notes</h2>
          <button
            onClick={addECCNote}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
          >
            + Add Note
          </button>
        </div>
        <div className="space-y-2">
          {formData.ecc_notes.map((note, index) => (
            <textarea
              key={index}
              value={note}
              onChange={(e) => updateECCNote(index, e.target.value)}
              placeholder="Click or tap here to enter text"
              rows={2}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          ))}
          {formData.ecc_notes.length === 0 && (
            <p className="text-gray-400 text-sm">No ECC notes added. Click "Add Note" to add one.</p>
          )}
        </div>
      </div>

      {/* Effected Properties */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Effected Properties</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Number of Injuries</label>
            <input
              type="number"
              min="0"
              value={formData.injuries_number || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, injuries_number: e.target.value ? parseInt(e.target.value) : undefined }))}
              placeholder="Choose an item"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Type of Injuries</label>
            <select
              value={formData.injuries_type || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, injuries_type: e.target.value as any }))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            >
              <option value="">Choose an item</option>
              <option value="Minor">Minor</option>
              <option value="Moderate">Moderate</option>
              <option value="Severe">Severe</option>
              <option value="Fatal">Fatal</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Production Effectiveness</label>
            <input
              type="text"
              value={formData.production_effectiveness || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, production_effectiveness: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Data Exported at</label>
            <input
              type="text"
              value={formData.data_exported_at || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, data_exported_at: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">Effected Properties</label>
            <input
              type="text"
              value={formData.properties_affected || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, properties_affected: e.target.value }))}
              placeholder="Click or tap here to enter text"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">Comments</label>
            <textarea
              value={formData.comments || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
              placeholder="Click or tap here to enter text"
              rows={4}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
            />
          </div>
        </div>
      </div>

      {/* Checklists */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Checklists</h2>
        
        {/* Emergency Responders */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-white">Emergency Responders</h3>
            <button
              onClick={() => initializeChecklist(responderChecklistItems, 'responder')}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
            >
              Initialize Checklist
            </button>
          </div>
          <div className="space-y-2">
            {formData.responder_actions.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-2 bg-gray-700 rounded">
                <span className="text-sm text-gray-300 flex-1">{item.item}</span>
                <select
                  value={item.answer}
                  onChange={(e) => updateChecklistItem('responder', index, e.target.value as any)}
                  className="px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>
            ))}
            {formData.responder_actions.length === 0 && (
              <p className="text-gray-400 text-sm">Click "Initialize Checklist" to load checklist items.</p>
            )}
          </div>
        </div>

        {/* Emergency Control Center */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-white">Emergency Control Center</h3>
            <button
              onClick={() => initializeChecklist(eccChecklistItems, 'ecc')}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
            >
              Initialize Checklist
            </button>
          </div>
          <div className="space-y-2">
            {formData.ecc_actions.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-2 bg-gray-700 rounded">
                <span className="text-sm text-gray-300 flex-1">{item.item}</span>
                <select
                  value={item.answer}
                  onChange={(e) => updateChecklistItem('ecc', index, e.target.value as any)}
                  className="px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>
            ))}
            {formData.ecc_actions.length === 0 && (
              <p className="text-gray-400 text-sm">Click "Initialize Checklist" to load checklist items.</p>
            )}
          </div>
        </div>

        {/* SA Affairs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-semibold text-white">SA Affairs</h3>
            <button
              onClick={() => initializeChecklist(saAffairsChecklistItems, 'sa_affairs')}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
            >
              Initialize Checklist
            </button>
          </div>
          <div className="space-y-2">
            {formData.sa_affairs_actions.map((item, index) => (
              <div key={index} className="flex items-center gap-3 p-2 bg-gray-700 rounded">
                <span className="text-sm text-gray-300 flex-1">{item.item}</span>
                <select
                  value={item.answer}
                  onChange={(e) => updateChecklistItem('sa_affairs', index, e.target.value as any)}
                  className="px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-xs"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="N/A">N/A</option>
                </select>
              </div>
            ))}
            {formData.sa_affairs_actions.length === 0 && (
              <p className="text-gray-400 text-sm">Click "Initialize Checklist" to load checklist items.</p>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-300">
            {reportId && (
              <span>Report ID: <strong className="text-white">{reportId}</strong> | Status: <strong className="text-white">{reportStatus}</strong></span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleGenerateReport}
              disabled={loading || reportStatus === 'closed'}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-md transition-colors"
            >
              {loading ? 'Generating...' : reportId ? 'Update Report' : 'Generate Report'}
            </button>
            
            {reportId && reportStatus !== 'closed' && (
              <>
                <button
                  onClick={handleCloseReport}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors"
                >
                  Close Report
                </button>
                <button
                  onClick={handleExportPDF}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors"
                >
                  Export PDF
                </button>
              </>
            )}
            
            {reportId && reportStatus === 'closed' && (
              <button
                onClick={handleExportPDF}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors"
              >
                Export PDF
              </button>
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default GenerateReport;
