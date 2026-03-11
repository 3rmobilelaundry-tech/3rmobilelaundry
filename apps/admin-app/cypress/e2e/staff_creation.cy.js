describe('Staff Creation Flow', () => {
  beforeEach(() => {
    // Mock login by setting token (if applicable) or intercepting
    // Assuming backend is running and we are testing the frontend interacting with it
    // But for pure integration testing without backend, we intercept.
    
    // We can simulate being logged in by visiting the page directly if the app allows it or mocking the auth state
    cy.visit('http://localhost:5000/admin-web'); // Adjust base URL as needed
    
    // Mock API responses
    cy.intercept('GET', '/admin/users', { body: [] }).as('getUsers');
    cy.intercept('POST', '/api/staff', { statusCode: 201, body: { id: 1, full_name: 'Jane Doe' } }).as('createStaff');
  });

  it('should add a receptionist successfully', () => {
    // Navigate to Staff page (assuming sidebar or menu)
    // If we are already on dashboard, find the link
    // For now, let's assume we can navigate via UI
    // cy.contains('Staff').click(); 
    
    // Or visit directly if routing is set up
    // cy.visit('http://localhost:5000/admin-web/staff');

    // Since we don't know the exact navigation structure, let's look for "Add Staff" assuming we are on the right screen
    // or assume the test starts on the staff screen.
    
    // Check for "Add Staff" button
    cy.contains('Add Staff').click();

    // Fill form
    // Note: React Native Web might not map testID to data-testid automatically without config.
    // If not, we fall back to placeholders or labels.
    // Assuming data-testid is NOT available by default in Expo Web unless configured.
    // We will use placeholders/labels which are more robust for web anyway.

    cy.get('input[placeholder="Full Name"]').type('Jane Doe');
    cy.get('input[placeholder="Phone Number"]').type('08012345678');
    cy.get('input[placeholder="Email"]').type('jane@example.com');
    
    // Select Role
    cy.contains('Receptionist').click();
    
    // Password
    cy.get('input[placeholder*="Min 8 chars"]').type('Password123');

    cy.contains('Save Staff').click();

    // Assert API Call
    cy.wait('@createStaff').then((interception) => {
      expect(interception.request.body).to.include({
        full_name: 'Jane Doe',
        role: 'receptionist'
      });
    });

    // Assert Success Toast
    cy.contains('Staff member added successfully').should('be.visible');
  });

  it('should show error on duplicate phone', () => {
    cy.intercept('POST', '/api/staff', {
      statusCode: 400,
      body: { error: 'Phone number already registered' }
    }).as('createStaffFail');

    cy.contains('Add Staff').click();
    
    cy.get('input[placeholder="Full Name"]').type('Duplicate User');
    cy.get('input[placeholder="Phone Number"]').type('08012345678'); // Existing
    cy.get('input[placeholder*="Min 8 chars"]').type('Password123');
    
    cy.contains('Save Staff').click();

    cy.wait('@createStaffFail');
    cy.contains('Phone number already registered').should('be.visible');
  });

  it('should add a different role (Rider)', () => {
    cy.contains('Add Staff').click();
    
    cy.get('input[placeholder="Full Name"]').type('Rider John');
    cy.get('input[placeholder="Phone Number"]').type('08099998888');
    
    cy.contains('Rider').click();
    cy.get('input[placeholder*="Min 8 chars"]').type('Password123');

    cy.contains('Save Staff').click();

    cy.wait('@createStaff').then((interception) => {
      expect(interception.request.body.role).to.equal('rider');
    });
  });
});
