import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';
import { queryKeys } from './queries';
import toast from 'react-hot-toast';

// Zone activation mutation
export const useActivateZone = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ zoneName, windDirection }: { zoneName: string; windDirection: string }) => {
      const response = await apiClient.post('/emergency-events/activate', null, {
        params: { zone_name: zoneName, wind_direction: windDirection }
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.lamps });
      queryClient.invalidateQueries({ queryKey: queryKeys.emergencyEvents });
      toast.success(`Zone ${variables.zoneName} activated successfully`);
    },
    onError: (error: any) => {
      console.error('Activation failed:', error);
      toast.error(`Failed to activate zone: ${error.response?.data?.detail || error.message}`);
    },
  });
};

// Zone deactivation mutation
export const useDeactivateZone = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/zones/deactivate', {});
      return response.data;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.lamps });
      queryClient.invalidateQueries({ queryKey: queryKeys.emergencyEvents });
      toast.success('Zone deactivated successfully');
    },
    onError: (error: any) => {
      console.error('Deactivation failed:', error);
      toast.error(`Failed to deactivate zone: ${error.response?.data?.detail || error.message}`);
    },
  });
};

