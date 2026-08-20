9/9

TASK: CONSOLIDATE_EMPLOYEE_ONBOARDING

PRODUCTION_URL=https://connect.fps-one.nl
CANONICAL_FLOW=CREATE_USER_ACCOUNT -> SELECT_USER_WITHOUT_EMPLOYEE_PROFILE -> ONBOARD_EXISTING_USER

REQUIRED_FLOW

1. `Instellingen > Gebruikers > Gebruiker toevoegen`
   - creates an authentication account only;
   - creates no employee profile;
   - stores account identity, role and permissions.

2. The new account must appear in:
   `Personeel / HRM > Gebruikers zonder medewerkerprofiel`

3. The row action `Onboarden` must open:
   `/personeel/onboarden?userId=<USER_ID>`

4. Completing onboarding must:
   - create exactly one employee profile;
   - link it to the selected existing user;
   - never create another authentication account.

FRONTEND

- Remove the global button `Medewerker onboarden` from the HRM personnel page.
- Remove every sidebar/menu/button entry that opens onboarding without a selected user.
- Keep only the row action `Onboarden` under `Gebruikers zonder medewerkerprofiel`.
- Require query parameter `userId` on `/personeel/onboarden`.
- Without `userId`: redirect to `/personeel?tab=medewerkers`.
- Invalid `userId`: show `USER_NOT_FOUND`.
- User already linked to employee: show `EMPLOYEE_PROFILE_ALREADY_EXISTS`.
- Pre-fill immutable identity fields from the selected user:
  - name
  - email
  - phone, when present.

BACKEND

Employee-profile creation input:

type CreateEmployeeProfileInput = {
  userId: string;
  employerId: string;
  functionId: string;
  caoId: string;
  employmentType: string;
  contractHoursPerWeek: number;
  employmentStartDate: string;
};

Validation sequence:

const user = await usersRepository.findById(input.userId);
if (!user) throw new NotFoundError("USER_NOT_FOUND");

const existingProfile =
  await employeesRepository.findByUserId(input.userId);

if (existingProfile) {
  throw new ConflictError("EMPLOYEE_PROFILE_ALREADY_EXISTS");
}

await employeesRepository.create({
  ...employeeFields,
  userId: user.id,
});

RULES

- User/account endpoints MUST NOT create employee records.
- Onboarding MUST NOT create user accounts.
- One user may have zero or one employee profile.
- Employee creation without an existing userId MUST fail.
- Do not alter existing users or employee profiles.
- Do not add a NOT NULL database constraint before confirming existing production rows are compatible.
- Add or retain a unique database constraint/index on employee.user_id only after verifying it causes no production-data conflict.

TESTS

TEST_CREATE_USER:
- users count increases by 1
- employees count unchanged

TEST_HRM_PENDING_USER:
- account without employee profile appears under
  `Gebruikers zonder medewerkerprofiel`

TEST_START_ONBOARDING:
- row action opens `/personeel/onboarden?userId=<USER_ID>`
- selected user identity is pre-filled

TEST_COMPLETE_ONBOARDING:
- employees count increases by 1
- created employee.user_id equals selected user.id
- users count unchanged

TEST_DUPLICATE_ONBOARDING:
- second onboarding attempt returns HTTP 409
- no duplicate employee profile created

TEST_DIRECT_ONBOARDING_WITHOUT_USER:
- `/personeel/onboarden` without userId redirects
- no employee profile created

DO_NOT_MODIFY

- login
- passwords
- sessions
- role definitions
- existing production records
- unrelated HRM functions
- scroll implementation

PRODUCTION_ACCEPTANCE

Verify directly on https://connect.fps-one.nl:

- global `Medewerker onboarden` button is absent;
- no standalone onboarding menu entry remains;
- onboarding starts only from `Gebruikers zonder medewerkerprofiel`;
- `Gebruiker toevoegen` creates only a user account;
- onboarding links one employee profile to that existing account;
- duplicate onboarding is impossible.

DONE only after GitHub main deployment and direct production verification.