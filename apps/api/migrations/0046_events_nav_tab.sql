ALTER TABLE `nav_tab_labels` DROP CONSTRAINT `nav_tab_labels_tab_check`;
ALTER TABLE `nav_tab_labels` ADD CONSTRAINT `nav_tab_labels_tab_check`
  CHECK (`tab` IN ('dashboard', 'agenda', 'groups', 'patients', 'plans', 'clinical', 'crm', 'events', 'relationship', 'waitlist', 'communications', 'contracts', 'sales', 'finance', 'reports', 'history', 'settings', 'profile'));
