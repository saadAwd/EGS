import apiClient from './client';

export interface PostEventReportRequest {
  event_id?: number;
  emergency_type: 'Real' | 'Drill' | 'Exercise' | 'Unknown';
  event_date: string;
  start_time: string; // HH:MM format
  end_time?: string; // HH:MM format
  location?: string;
  subject?: string;
  description?: string;
  activation_scenario?: string;
  activation_911: 'Yes' | 'No' | 'Unknown';
  
  // Incident Manager
  incident_manager_name?: string;
  incident_manager_login_id?: string;
  incident_manager_organization?: string;
  incident_manager_badge_id?: string;
  
  // Incident Commander
  incident_commander_name?: string;
  incident_commander_login_id?: string;
  incident_commander_division?: string;
  incident_commander_badge_id?: string;
  
  // Observations
  observations: Array<{
    rank?: number;
    observation?: string;
    priority: 'High' | 'Medium' | 'Low' | 'Unknown';
    recommendation?: string;
    recommendation_classification: 'Site Response' | 'Area Response' | 'Company Response' | 'Other' | 'Unknown';
  }>;
  
  // Sequence of Events
  sequence_of_events: Array<{
    time?: string; // HH:MM format
    event?: string;
    attended_in_icp?: string;
    login_id?: string;
    organization?: string;
  }>;
  
  // ECC Notes
  ecc_notes: string[];
  
  // Effects
  properties_affected?: string;
  production_effectiveness?: string;
  data_exported_at?: string;
  comments?: string;
  
  // Injuries
  injuries_number?: number;
  injuries_type?: 'Minor' | 'Moderate' | 'Severe' | 'Fatal' | 'Unknown';
  
  // Checklists
  responder_actions: Array<{ item: string; answer: 'Yes' | 'No' | 'N/A' }>;
  ecc_actions: Array<{ item: string; answer: 'Yes' | 'No' | 'N/A' }>;
  sa_affairs_actions: Array<{ item: string; answer: 'Yes' | 'No' | 'N/A' }>;
}

export interface PostEventReportResponse {
  report_id: string;
  status: 'draft' | 'finalized';
  missing_fields: Array<{ path: string; reason: string }>;
  created_at: string;
}

export const reportsApi = {
  async generateReport(data: PostEventReportRequest): Promise<PostEventReportResponse> {
    const response = await apiClient.post<PostEventReportResponse>('/reports/generate', data);
    return response.data;
  },

  async getReport(reportId: string) {
    const response = await apiClient.get(`/reports/${reportId}`);
    return response.data;
  },

  async updateReport(reportId: string, data: PostEventReportRequest) {
    const response = await apiClient.patch(`/reports/${reportId}`, data);
    return response.data;
  },

  async closeReport(reportId: string) {
    const response = await apiClient.post(`/reports/${reportId}/close`);
    return response.data;
  },

  async exportPDF(reportId: string) {
    const response = await apiClient.get(`/reports/${reportId}/pdf`, {
      responseType: 'blob'
    });
    return response.data;
  },

  async listReports() {
    const response = await apiClient.get('/reports/');
    return response.data;
  },

  async getEventData(eventId: number) {
    const response = await apiClient.get(`/reports/event/${eventId}/data`);
    return response.data;
  }
};

