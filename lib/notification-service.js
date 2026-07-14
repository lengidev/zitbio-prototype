// NotificationService — listens for BioData events and creates notification alerts.
// New observations default to "Pending" so admins know they need review.
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
      'observations.html',
      observation.observation_id
    );
  }

  function onUserCreated(user) {
    if (!user) return;

    BioData.addNotification(
      'new_user',
      'New User Registered',
      user.name + ' (' + user.email + ') has joined as ' + user.role + '.',
      'users.html',
      'user_' + user.id
    );
  }

  function register() {
    // Connect the two events so notifications fire without the data layer
    // needing to know anything about this service.
    BioData.subscribe(BioData.eventNames.OBSERVATION_CREATED, onObservationCreated);
    BioData.subscribe(BioData.eventNames.USER_CREATED, onUserCreated);
  }

  // TODO: Add an email alert channel — subscribe to the same events and
  // send to the backend mailer once it exists.

  // Self-register as soon as this script loads (data.js must be loaded first).
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