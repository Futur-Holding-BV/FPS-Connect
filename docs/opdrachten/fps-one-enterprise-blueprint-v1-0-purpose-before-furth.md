# FPS ONE Enterprise Blueprint v1.0

Purpose

Before further implementation, define the permanent enterprise architecture of FPS ONE.

This is not a software design exercise.

This is the business architecture that all future development must follow.

Do not write code.

Do not redesign the UI.

The output of this assignment becomes the architectural foundation for FPS ONE.

---

## Fundamental principle

FPS ONE is customer-centric.

The CRM Customer is the permanent root entity of the platform.

Projects, contracts, inspections and DMS all originate from the customer relationship.

No module may become the owner of the customer.

---

## Enterprise domains

Validate and refine the following business domains.

### 1. CRM Domain

Owner of:

* Customers
* Contact persons
* Customer locations
* Contracts
* Communication
* Relationship history

CRM is the entry point of FPS ONE.

---

### 2. Execution Domain

Owner of:

* Quotations
* Assignments
* Projects
* Work Orders
* Planning
* Workday
* Time Registration
* Completion
* Labour Cost Calculation

Executed by:

* FPS Bouw
* FPS Brandpreventie

---

### 3. Inspection Domain

Owner of:

* Maintenance Contracts
* Inspection Planning
* Inspections
* Findings
* Inspection Reports

Executed by:

* FPS Onderhoud

Important:

FPS Onderhoud performs inspections and testing only.

FPS Onderhoud does NOT perform repair work.

Repair findings may create a commercial process.

---

### 4. Commercial Domain

Owner of:

* Cost Calculations
* Quotations
* Customer Approval
* Conversion to Projects

Business flow:

Finding
→ Cost Calculation
→ Quotation
→ Accepted
→ Project

---

### 5. DMS Domain

Owner of:

* DMS Contracts
* Buildings / Objects
* Fire Safety Provisions
* Documents
* Certificates
* Compliance Documentation
* Document History

Important:

DMS is an independent commercial product.

A customer may purchase:

* DMS only
* Inspection only
* Execution only
* Any combination

Do not make DMS dependent on Inspection.

Do not make Inspection dependent on DMS.

---

## Enterprise relationships

Customer

↓

may own

* multiple projects
* multiple maintenance contracts
* multiple DMS contracts
* multiple locations
* multiple buildings

Projects belong to the Execution Domain.

Buildings belong to the DMS Domain.

Findings belong to the Inspection Domain.

Work Orders belong to the Execution Domain.

Inspection may generate Findings.

Findings may generate Quotations.

Accepted Quotations generate Projects.

Projects generate Work Orders.

Completed Projects may update DMS information.

---

## Architectural rules

No domain may own another domain's business objects.

Domains may reference each other.

Domains may never duplicate ownership.

Every business object has exactly one Single Source of Truth.

---

## Deliverables

Produce:

1. Enterprise Domain Diagram
2. Domain ownership matrix
3. Entity ownership matrix
4. Cross-domain dependency diagram
5. Business event flow
6. Single Source of Truth matrix
7. Recommended implementation roadmap
8. Risks and inconsistencies in the current implementation
9. Architectural changes required before further development

This Enterprise Blueprint becomes the reference architecture for all future FPS ONE development.

Future implementation must be validated against this blueprint before coding.
