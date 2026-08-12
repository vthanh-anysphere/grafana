import { HttpResponse, http } from 'msw';
import { getWrapper, renderHook, waitFor } from 'test/test-utils';

import { AccessControlAction } from 'app/types/accessControl';

import { setupMswServer } from '../../mockApi';
import { grantUserPermissions } from '../../mocks';
import { setupDataSources } from '../../testSetup/datasources';
import { GRAFANA_RULES_SOURCE_NAME } from '../../utils/datasource';
import {
  PROVISIONED_MIMIR_ALERTMANAGER_UID,
  mockDataSources,
  setupVanillaAlertmanagerServer,
} from '../settings/mocks/server';

import { useGetNotificationTemplate } from './useNotificationTemplates';

const server = setupMswServer();

const wrapper = () => getWrapper({ renderWithRouter: true });

function renderGetTemplate(alertmanager: string, uid: string) {
  return renderHook(() => useGetNotificationTemplate({ alertmanager, uid }), { wrapper: wrapper() });
}

/** Serves an Alertmanager configuration that contains a single template group. */
function setupExternalAlertmanagerTemplates(templateName: string, content: string) {
  server.use(
    http.get('/api/alertmanager/:name/config/api/v1/alerts', () =>
      HttpResponse.json({
        alertmanager_config: {
          route: { receiver: 'default' },
          receivers: [{ name: 'default' }],
          templates: [templateName],
        },
        template_files: { [templateName]: content },
      })
    )
  );
}

beforeEach(() => {
  grantUserPermissions([
    AccessControlAction.AlertingNotificationsRead,
    AccessControlAction.AlertingNotificationsWrite,
    AccessControlAction.AlertingNotificationsExternalRead,
    AccessControlAction.AlertingNotificationsExternalWrite,
  ]);

  setupVanillaAlertmanagerServer(server);
  setupDataSources(mockDataSources[PROVISIONED_MIMIR_ALERTMANAGER_UID]);
});

describe('useGetNotificationTemplate', () => {
  it('returns the template when it exists in the Alertmanager configuration', async () => {
    setupExternalAlertmanagerTemplates('mimir-template', '{{ define "mimir-template" }}hello{{ end }}');

    const { result } = renderGetTemplate(PROVISIONED_MIMIR_ALERTMANAGER_UID, 'mimir-template');

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.currentData).toMatchObject({
      uid: 'mimir-template',
      title: 'mimir-template',
      content: '{{ define "mimir-template" }}hello{{ end }}',
    });
    expect(result.current.isError).toBe(false);
  });

  it('surfaces a not found error for a missing template on the Grafana Alertmanager', async () => {
    const { result } = renderGetTemplate(GRAFANA_RULES_SOURCE_NAME, 'template-that-does-not-exist');

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.currentData).toBeUndefined();
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toMatchObject({ status: 404 });
  });

  // Reproduces the missing error state for Alertmanagers served by the config API: the request for the
  // whole configuration succeeds, so a template that isn't in it is reported as a successful fetch with
  // no data. Remove `.failing` once the hook reports the template as not found.
  it.failing('surfaces a not found error for a missing template on an external Alertmanager', async () => {
    setupExternalAlertmanagerTemplates('mimir-template', '{{ define "mimir-template" }}hello{{ end }}');

    const { result } = renderGetTemplate(PROVISIONED_MIMIR_ALERTMANAGER_UID, 'template-that-does-not-exist');

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.currentData).toBeUndefined();
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeDefined();
    expect(result.current.isSuccess).toBe(false);
  });
});
