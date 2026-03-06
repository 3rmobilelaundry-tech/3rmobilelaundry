describe('Subscriptions Form', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5000/admin-web');
    cy.intercept('GET', '/api/subscriptions', { body: [] }).as('getSubscriptions');
    cy.intercept('GET', '/api/plans', {
      body: [
        { plan_id: 1, name: 'Gold', price: 5000, duration_days: 30, max_pickups: 4 }
      ]
    }).as('getPlans');
    cy.intercept('GET', '/api/users*', {
      body: {
        items: [
          { user_id: 10, full_name: 'Alice Doe', student_id: 'STU001', email: 'alice@example.com' }
        ]
      }
    }).as('getUsers');
    cy.intercept('POST', '/api/subscriptions', {
      statusCode: 201,
      body: { subscription_id: 1 }
    }).as('createSubscription');
  });

  it('creates a subscription with validation', () => {
    cy.contains('Subscriptions').click();
    cy.contains('Add Student').click();

    cy.get('input[placeholder="Search student name or ID..."]').type('Alice');
    cy.contains('Alice Doe (STU001)').click();

    cy.contains('Gold').click();
    cy.get('input[placeholder="YYYY-MM-DD"]').first().clear().type('2025-01-01');
    cy.get('input[placeholder="YYYY-MM-DD"]').last().clear().type('2025-01-31');
    cy.get('input[placeholder="0.00"]').clear().type('5000');

    cy.contains('Save Subscription').click();

    cy.wait('@createSubscription').then((interception) => {
      expect(interception.request.body).to.include({
        user_id: 10,
        plan_id: 1,
        status: 'active'
      });
    });
  });
});
