// NotificationService: turns BioData events into admin notification alerts.
window.NotificationService = (function() {

  function onObservationCreated(observation) {
    if (!observation || observation.verification_status !== 'Pending') return;

    var species = observation.species_details
      ? (observation.species_details.common_name || observation.species_details.scientific_name)
      : 'Unknown';
    var locationArea = observation.location
      ? (observation.location.administrative_area || observation.location.city || '')
      : '';

    BioData.addNotification(
      'pending_observation',
      'New Pending Observation',
      species + ' recorded by ' + observation.recorded_by + ' in ' + locationArea + ' needs review.',
      '../observations/observations.html?obs=' + observation.observation_id,
      observation.observation_id
    );
  }

  function onUserCreated(user) {
    if (!user) return;

    BioData.addNotification(
      'new_user',
      'New User Registered',
      user.name + ' (' + user.email + ') has joined as ' + user.role + '.',
      '../users/users.html',
      'user_' + user.id
    );
  }

  function register() {
    // Subscribed from here, so the data layer needs to know nothing about this service.
    BioData.subscribe(BioData.eventNames.OBSERVATION_CREATED, onObservationCreated);
    BioData.subscribe(BioData.eventNames.USER_CREATED, onUserCreated);
  }

  // TODO: add an email alert channel that subscribes to these same events and
  // sends through the backend mailer once one exists.

  // Self-registers on load; data.js must be loaded first.
  if (window.BioData && window.BioData.eventNames) {
    register();
  } else {
    console.error('NotificationService: BioData not loaded before notification-service.js');
  }

  return {
    register: register,
    onObservationCreated: onObservationCreated,
    onUserCreated: onUserCreated
  };

})();