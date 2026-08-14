export {
  usePendingRequests,
  useAllRequests,
  useApproveRequest,
  useRejectRequest,
  useResendOTP,
  useRequestDetail,
  useApprovalStats,
} from './useRegistrationRequests';

export {
  useGRList,
  useGRDetail,
  useCreateGR,
  useUpdateGRStatus,
  useAssignDriver,
  useAssignStaff,
  useUploadSlip,
  useCompanies,
} from './useGR';

export {
  useUsers,
  useUpdateUserStatus,
  useDeleteUser,
  useDrivers,
  useCreateDriver,
  useVehicles,
} from './useUsers';

export {
  usePendingStaffRequests,
  useApproveStaffRequest,
  useRejectStaffRequest,
  useStaffUsers,
  useUpdateStaffStatus,
  useCreateStaff,
} from './useStaff';