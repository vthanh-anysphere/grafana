import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { getWrapper } from 'test/test-utils';

import { AccessControlAction } from 'app/types/accessControl';

import { isNotFoundError } from '../../api/util';
import { setupMswServer } from '../../mockApi';
import { grantUserPermissions } from '../../mocks';
import { GRAFANA_RULES_SOURCE_NAME } from '../../utils/datasource';
import { shouldUseK8sApi } from '../../utils/k8s/utils';

import { useGetNotificationTemplate } from './useNotificationTemplates';

jest.mock('../../utils/k8s/utils', () => ({
  ...jest.requireActual('../../utils/k8s/utils'),
  shouldUseK8sApi: jest.fn(),
}));

const mockedShouldUseK8sApi = shouldUseK8sApi as jest.MockedFunction<typeof shouldUseK8sApi>;

const wrapper = ({ children }: { children: ReactNode }) => {
  const ProviderWrapper = getWrapper({ renderWithRouter: true });
  return <ProviderWrapper>{children}</ProviderWrapper>;
};

setupMswServer();

async function renderGetTemplate(uid: string) {
  const { result } = renderHook(() => useGetNotificationTemplate({ alertmanager: GRAFANA_RULES_SOURCE_NAME, uid }), {
    wrapper,
  });

  await waitFor(() => {
    expect(result.current.isUninitialized).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  return result;
}

describe('useGetNotificationTemplate', () => {
  beforeEach(() => {
    grantUserPermissions([
      AccessControlAction.AlertingNotificationsRead,
      AccessControlAction.AlertingNotificationsWrite,
    ]);
    mockedShouldUseK8sApi.mockReset();
  });

  describe('Alertmanager config API', () => {
    beforeEach(() => {
      mockedShouldUseK8sApi.mockReturnValue(false);
    });

    it('returns an existing template', async () => {
      const result = await renderGetTemplate('custom-email');

      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(result.current.data).toEqual(
        expect.objectContaining({
          uid: 'custom-email',
          title: 'custom-email',
          missing: false,
        })
      );
    });

    it('sets isError and a not-found error for an unknown UID', async () => {
      const result = await renderGetTemplate('does-not-exist');

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.data).toBeUndefined();
      expect(result.current.currentData).toBeUndefined();
      expect(isNotFoundError(result.current.error)).toBe(true);
    });

    it('treats templates present only in template_files as success', async () => {
      const result = await renderGetTemplate('misconfigured-template');

      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(result.current.data).toEqual(
        expect.objectContaining({
          uid: 'misconfigured-template',
          title: 'misconfigured-template',
          missing: true,
        })
      );
    });
  });

  describe('Kubernetes API', () => {
    beforeEach(() => {
      mockedShouldUseK8sApi.mockReturnValue(true);
    });

    it('returns an existing template', async () => {
      const result = await renderGetTemplate('k8s-custom-email-resource-name');

      expect(result.current.isError).toBe(false);
      expect(result.current.data).toEqual(
        expect.objectContaining({
          uid: 'k8s-custom-email-resource-name',
          title: 'custom-email',
        })
      );
    });

    it('sets isError and a not-found error for an unknown UID', async () => {
      const result = await renderGetTemplate('does-not-exist');

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(result.current.data).toBeUndefined();
      expect(isNotFoundError(result.current.error)).toBe(true);
    });
  });
});
