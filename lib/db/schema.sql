-- FPS Connect — schemamomentopname (nulpunt SCHEMA_01)
-- Gegenereerd uit de PRODUCTIEDATABASE (fps_production) op 7 augustus 2026 via pg_dump --schema-only.
-- Dit bestand is het referentiepunt: elke wijziging hierna loopt via lib/db/src/migrations/.
-- Niet handmatig bewerken; regenereren via: docs in docs/PRODUCTION_RUNBOOK.md.
--
-- PostgreSQL database dump
--

\restrict SZBBHOat5XhqAV2WjkgQ44d1k7WWV0ab9cVsTszibzv3TnkOZGDIlSwe3s5IAqK

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: aanvraag_planningen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aanvraag_planningen (
    id integer NOT NULL,
    inbox_item_id integer,
    offerte_id integer,
    afzender_email text,
    afzender_naam text,
    ai_responstermijn text,
    ai_opname text,
    ai_plattegronden text,
    gewenste_responstermijn text,
    opname_nodig text,
    plattegronden_status text,
    extra_opmerking text,
    antwoord_token text NOT NULL,
    bevestiging_verzond_op timestamp without time zone,
    antwoorden_ontvangen_op timestamp without time zone,
    pl_planning_datum text,
    pl_notitie text,
    pl_bijgewerkt_op timestamp without time zone,
    melding_verzond_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: aanvraag_planningen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aanvraag_planningen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aanvraag_planningen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aanvraag_planningen_id_seq OWNED BY public.aanvraag_planningen.id;


--
-- Name: aanvraag_voorstellen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aanvraag_voorstellen (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    mail_message_id text NOT NULL,
    mailbox_adres text NOT NULL,
    is_persoonlijk boolean DEFAULT false NOT NULL,
    afzender_naam text,
    afzender_email text DEFAULT ''::text NOT NULL,
    onderwerp text DEFAULT ''::text NOT NULL,
    binnengekomen_op timestamp without time zone NOT NULL,
    voorstel_type text DEFAULT 'nieuwe_aanvraag'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    ai_voorstel jsonb,
    concept_antwoord text,
    concept_vorm text DEFAULT 'bevestiging'::text NOT NULL,
    bijlagen jsonb,
    antwoord_verstuurd_op timestamp without time zone,
    projectkans_id integer,
    beoordeeld_door_id integer,
    beoordeeld_op timestamp without time zone,
    beoordeel_notitie text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: aanvraag_voorstellen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.aanvraag_voorstellen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: aanvraag_voorstellen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.aanvraag_voorstellen_id_seq OWNED BY public.aanvraag_voorstellen.id;


--
-- Name: abonnementen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abonnementen (
    id integer NOT NULL,
    naam text NOT NULL,
    niveau text DEFAULT 'basis'::text NOT NULL,
    prijs_per_maand real DEFAULT 0 NOT NULL,
    max_gebouwen integer,
    max_gebruikers integer,
    functies text[],
    klant_naam text,
    klant_email text,
    start_datum text,
    eind_datum text,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: abonnementen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.abonnementen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: abonnementen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.abonnementen_id_seq OWNED BY public.abonnementen.id;


--
-- Name: accountview_export_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accountview_export_logs (
    id integer NOT NULL,
    factuur_id integer NOT NULL,
    gebruiker_id integer,
    export_op timestamp without time zone DEFAULT now() NOT NULL,
    testmodus boolean DEFAULT true NOT NULL,
    actie text DEFAULT 'export'::text NOT NULL,
    verzonden_payload jsonb,
    accountview_response jsonb,
    http_status integer,
    payload_hash text,
    status text DEFAULT 'bezig'::text NOT NULL,
    accountview_boeking_id text,
    foutmelding text,
    aangemeld_door_gebruiker text
);


--
-- Name: accountview_export_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accountview_export_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accountview_export_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accountview_export_logs_id_seq OWNED BY public.accountview_export_logs.id;


--
-- Name: accountview_instellingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accountview_instellingen (
    id integer NOT NULL,
    api_endpoint text,
    administratiecode text,
    api_gebruiker text,
    api_key text,
    testmodus boolean DEFAULT true NOT NULL,
    dagboek_inkoop text DEFAULT 'INK'::text,
    dagboek_verkoop text DEFAULT 'VRK'::text,
    grootboek_standaard text,
    btw_codes jsonb DEFAULT '{}'::jsonb,
    kostenplaatsen jsonb DEFAULT '{}'::jsonb,
    debiteur_mapping jsonb DEFAULT '{}'::jsonb,
    crediteur_mapping jsonb DEFAULT '{}'::jsonb,
    export_actief boolean DEFAULT false NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    grootboek_voorraad text,
    grootboek_inkoop_kosten text,
    magazijn_export_actief boolean DEFAULT false NOT NULL
);


--
-- Name: accountview_instellingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accountview_instellingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accountview_instellingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accountview_instellingen_id_seq OWNED BY public.accountview_instellingen.id;


--
-- Name: accountview_project_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accountview_project_mapping (
    id integer NOT NULL,
    connect_project_code text NOT NULL,
    connect_gebouw_naam text,
    accountview_projectcode text,
    accountview_kostenplaats text,
    opmerking text,
    export_zonder_mapping boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: accountview_project_mapping_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accountview_project_mapping_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accountview_project_mapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accountview_project_mapping_id_seq OWNED BY public.accountview_project_mapping.id;


--
-- Name: accountview_relatie_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accountview_relatie_mapping (
    id integer NOT NULL,
    connect_relatienaam text NOT NULL,
    accountview_code text NOT NULL,
    type text DEFAULT 'crediteur'::text NOT NULL,
    opmerking text,
    bestaat_in_accountview boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: accountview_relatie_mapping_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accountview_relatie_mapping_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accountview_relatie_mapping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accountview_relatie_mapping_id_seq OWNED BY public.accountview_relatie_mapping.id;


--
-- Name: activiteiten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activiteiten (
    id integer NOT NULL,
    type text NOT NULL,
    omschrijving text NOT NULL,
    gebouw_id integer,
    gebouw_naam text,
    voorziening_id integer,
    voorziening_nummer text,
    gebruiker_id integer,
    gebruiker_naam text,
    offerte_id integer,
    tijdstip timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: activiteiten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activiteiten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activiteiten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activiteiten_id_seq OWNED BY public.activiteiten.id;


--
-- Name: ai_aanroepen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_aanroepen (
    id integer NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    module text NOT NULL,
    functie text,
    gebruiker_id integer,
    entiteitstype text,
    entiteit_id integer,
    model_slot text NOT NULL,
    model_naam text NOT NULL,
    prompt_naam text,
    prompt_versie text,
    prompt_hash text,
    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    geschatte_kosten_eur numeric,
    duur_ms integer,
    status text DEFAULT 'ok'::text NOT NULL,
    foutmelding text,
    context_json jsonb,
    uitvoer_tekst text
);


--
-- Name: ai_aanroepen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_aanroepen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_aanroepen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_aanroepen_id_seq OWNED BY public.ai_aanroepen.id;


--
-- Name: ai_beslissingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_beslissingen (
    id integer NOT NULL,
    token text NOT NULL,
    taaknaam text NOT NULL,
    module text NOT NULL,
    proces_naam text,
    aanvrager_id integer,
    status text DEFAULT 'wacht_op_gebruiker'::text NOT NULL,
    voorstel text,
    betrouwbaarheid text,
    controle_nodig boolean DEFAULT false NOT NULL,
    model_slot text,
    prompt_naam text,
    prompt_versie text,
    context_json jsonb,
    beslist_door_id integer,
    beslist_op timestamp without time zone,
    opmerking text,
    verloopt_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_beslissingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_beslissingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_beslissingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_beslissingen_id_seq OWNED BY public.ai_beslissingen.id;


--
-- Name: ai_categorie_correcties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_categorie_correcties (
    id integer NOT NULL,
    hash text,
    tekst_fragment text,
    ai_voorstel text NOT NULL,
    gekozen text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_categorie_correcties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_categorie_correcties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_categorie_correcties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_categorie_correcties_id_seq OWNED BY public.ai_categorie_correcties.id;


--
-- Name: ai_prompt_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_prompt_scans (
    id integer NOT NULL,
    gebruiker_id integer,
    gebruiker_naam text,
    rol text,
    module text NOT NULL,
    functie text,
    prompt_samenvatting text,
    classificatie text DEFAULT 'groen'::text NOT NULL,
    risico_score integer DEFAULT 0 NOT NULL,
    injectie_gedetecteerd boolean DEFAULT false NOT NULL,
    injectie_signalen jsonb,
    beslissing text DEFAULT 'toegestaan'::text NOT NULL,
    motivatie text,
    ai_aanroep_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_prompt_scans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_prompt_scans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_prompt_scans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_prompt_scans_id_seq OWNED BY public.ai_prompt_scans.id;


--
-- Name: ai_veld_correcties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_veld_correcties (
    id integer NOT NULL,
    hash text,
    tekst_fragment text,
    veld_naam text NOT NULL,
    ai_voorstel text NOT NULL,
    gekozen text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_veld_correcties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_veld_correcties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_veld_correcties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_veld_correcties_id_seq OWNED BY public.ai_veld_correcties.id;


--
-- Name: ai_wijzigingsvoorstellen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_wijzigingsvoorstellen (
    id integer NOT NULL,
    prompt_scan_id integer,
    gebruiker_id integer,
    gebruiker_naam text,
    rol text,
    titel text NOT NULL,
    beschrijving text NOT NULL,
    impactanalyse text,
    betrokken_modules jsonb,
    risico_niveau text DEFAULT 'oranje'::text NOT NULL,
    status text DEFAULT 'wacht'::text NOT NULL,
    goedgekeurd_door_id integer,
    goedgekeurd_door_naam text,
    opmerking text,
    afgehandeld_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_wijzigingsvoorstellen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_wijzigingsvoorstellen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_wijzigingsvoorstellen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_wijzigingsvoorstellen_id_seq OWNED BY public.ai_wijzigingsvoorstellen.id;


--
-- Name: app_instellingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_instellingen (
    id integer NOT NULL,
    support_email text,
    support_telefoon text,
    support_website text,
    extra_disclaimer text,
    opdrachtbevestiging_auto_verzenden boolean DEFAULT false NOT NULL,
    ai_kostendrempel_eur numeric(10,4),
    ai_drempel_melding_gestuurd_maand text,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_door_id integer,
    moments_verjaardag_ingeschakeld boolean DEFAULT true NOT NULL,
    heatmap_tracking_ingeschakeld boolean DEFAULT false NOT NULL,
    ai_maandelijkse_export_dag integer,
    ai_maandelijkse_export_email text,
    ai_maandelijkse_export_laatst_verzonden_maand text,
    aanvraag_reactietermijn_uren integer DEFAULT 24 NOT NULL,
    aanvraag_oppak_termijn_uren integer DEFAULT 72 NOT NULL
);


--
-- Name: app_instellingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_instellingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_instellingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_instellingen_id_seq OWNED BY public.app_instellingen.id;


--
-- Name: arbeidsovereenkomsten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arbeidsovereenkomsten (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    werkgever_id integer,
    functie_id integer,
    contracttype text DEFAULT 'bepaalde_tijd'::text NOT NULL,
    start_datum text NOT NULL,
    eind_datum text,
    proeftijd_dagen integer,
    functie_omschrijving text,
    cao text,
    salaris_bruto real,
    arbeidsduur_per_week real,
    status text DEFAULT 'actief'::text NOT NULL,
    voorgaand_contract_id integer,
    ondertekening_vereist boolean DEFAULT false NOT NULL,
    ondertekend_door_medewerker_op text,
    ondertekend_door_hr_op text,
    ondertekend_door_hr_id integer,
    notities text,
    ingebracht_document_id integer,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: arbeidsovereenkomsten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.arbeidsovereenkomsten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: arbeidsovereenkomsten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.arbeidsovereenkomsten_id_seq OWNED BY public.arbeidsovereenkomsten.id;


--
-- Name: artikelen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artikelen (
    id integer NOT NULL,
    code text,
    naam text NOT NULL,
    omschrijving text,
    eenheid text DEFAULT 'st'::text NOT NULL,
    categorie text,
    merk text,
    leverancier_id integer,
    leveranciers_artikel_nr text,
    inkoopprijs real,
    verkoopprijs real,
    gemiddeld_inkoopprijs real,
    laatste_inkoopprijs real,
    btw_percentage integer DEFAULT 21 NOT NULL,
    minimum_voorraad real,
    gewenste_voorraad real,
    barcode text,
    locatie_id integer,
    notities text,
    actief boolean DEFAULT true NOT NULL,
    bron text DEFAULT 'handmatig'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    goedgekeurd_door_fps boolean DEFAULT false NOT NULL,
    toepassingsgebied text,
    montagevoorschriften text,
    compatibele_artikel_ids integer[],
    alternatieve_artikel_ids integer[],
    certificeringen text[],
    kb_notities text
);


--
-- Name: artikelen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.artikelen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: artikelen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.artikelen_id_seq OWNED BY public.artikelen.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    tijdstip timestamp without time zone DEFAULT now() NOT NULL,
    gebruiker_id integer,
    gebruiker_naam text,
    ip_adres text,
    sessie_id text,
    module text NOT NULL,
    actie text NOT NULL,
    entiteit text NOT NULL,
    entiteit_id integer,
    entiteit_naam text,
    oude_waarde jsonb,
    nieuwe_waarde jsonb,
    workflow_status text,
    gebouw_id integer,
    medewerker_id integer,
    document_id integer,
    meta jsonb
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: avg_inzageverzoeken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avg_inzageverzoeken (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    type text DEFAULT 'inzage'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opmerking text,
    beheerder_opmerking text,
    afgerond_op timestamp without time zone,
    geanonimiseerd_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: avg_inzageverzoeken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avg_inzageverzoeken_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avg_inzageverzoeken_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avg_inzageverzoeken_id_seq OWNED BY public.avg_inzageverzoeken.id;


--
-- Name: avg_opschoon_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avg_opschoon_log (
    id integer NOT NULL,
    activiteiten_verwijderd integer DEFAULT 0 NOT NULL,
    accounts_geanonimiseerd integer DEFAULT 0 NOT NULL,
    uitgevoerd_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: avg_opschoon_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avg_opschoon_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avg_opschoon_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avg_opschoon_log_id_seq OWNED BY public.avg_opschoon_log.id;


--
-- Name: avg_verwerkers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avg_verwerkers (
    id integer NOT NULL,
    naam text NOT NULL,
    land text,
    doel text,
    categorie_persoonsgegevens text,
    grondslag text,
    vwo_aanwezig boolean DEFAULT false NOT NULL,
    vwo_datum text,
    contactpersoon text,
    notities text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: avg_verwerkers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.avg_verwerkers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: avg_verwerkers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.avg_verwerkers_id_seq OWNED BY public.avg_verwerkers.id;


--
-- Name: backup_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_records (
    id integer NOT NULL,
    slug text NOT NULL,
    soort text DEFAULT 'handmatig'::text NOT NULL,
    omgeving text DEFAULT 'development'::text NOT NULL,
    git_commit text,
    versie_app text,
    status text DEFAULT 'bezig'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    voltooid_op timestamp without time zone,
    grootte_database_bytes bigint,
    grootte_config_bytes bigint,
    checksum_database text,
    checksum_config text,
    fout_tekst text,
    aangemaakt_door_id integer
);


--
-- Name: backup_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: backup_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.backup_records_id_seq OWNED BY public.backup_records.id;


--
-- Name: bedrijfssluitingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bedrijfssluitingen (
    id integer NOT NULL,
    naam text NOT NULL,
    datum_start text NOT NULL,
    datum_eind text NOT NULL,
    type text DEFAULT 'bedrijfssluiting'::text NOT NULL,
    omschrijving text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: bedrijfssluitingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bedrijfssluitingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bedrijfssluitingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bedrijfssluitingen_id_seq OWNED BY public.bedrijfssluitingen.id;


--
-- Name: bekwaamheden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bekwaamheden (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    categorie text DEFAULT 'werkzaamheid'::text NOT NULL,
    onderwerp text NOT NULL,
    niveau text DEFAULT 'niet_bevoegd'::text NOT NULL,
    vastgesteld_door text,
    vastgesteld_op text,
    opmerking text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: bekwaamheden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bekwaamheden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bekwaamheden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bekwaamheden_id_seq OWNED BY public.bekwaamheden.id;


--
-- Name: boekhouder_uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boekhouder_uploads (
    id integer NOT NULL,
    map text NOT NULL,
    werkmaatschappij text,
    werkgever_id integer,
    periode_jaar integer,
    periode_maand integer,
    omschrijving text,
    bestandsnaam text NOT NULL,
    object_path text NOT NULL,
    bestandsgrootte integer,
    mime_type text,
    gelezen boolean DEFAULT false NOT NULL,
    uploader_id integer,
    uploader_naam text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: boekhouder_uploads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.boekhouder_uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: boekhouder_uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.boekhouder_uploads_id_seq OWNED BY public.boekhouder_uploads.id;


--
-- Name: brandstof_importen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brandstof_importen (
    id integer NOT NULL,
    bestandsnaam text NOT NULL,
    brontype text NOT NULL,
    leverancier text DEFAULT 'mkb_brandstof'::text NOT NULL,
    status text DEFAULT 'verwerkt'::text NOT NULL,
    aantal_regels integer DEFAULT 0 NOT NULL,
    aantal_gekoppeld integer DEFAULT 0 NOT NULL,
    aantal_onzeker integer DEFAULT 0 NOT NULL,
    aantal_ontkoppeld integer DEFAULT 0 NOT NULL,
    periode_van timestamp without time zone,
    periode_tot timestamp without time zone,
    factuur_nummer text,
    totaal_bedrag real,
    totaal_btw real,
    ai_signalen jsonb,
    geladen boolean DEFAULT false NOT NULL,
    geladen_op timestamp without time zone,
    geladen_door_id integer,
    aangemaakt_door_id integer,
    werkgever_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: brandstof_importen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brandstof_importen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brandstof_importen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brandstof_importen_id_seq OWNED BY public.brandstof_importen.id;


--
-- Name: brandstof_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brandstof_regels (
    id integer NOT NULL,
    import_id integer NOT NULL,
    datum timestamp without time zone,
    kenteken text,
    pasnummer text,
    locatie text,
    product text,
    hoeveelheid real,
    eenheid text,
    bedrag_ex_btw real,
    btw real,
    bedrag_incl_btw real,
    km_stand integer,
    voertuig_id integer,
    koppeling_status text DEFAULT 'onzeker'::text NOT NULL,
    koppeling_score real,
    kosten_id integer,
    opmerkingen text
);


--
-- Name: brandstof_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brandstof_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brandstof_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brandstof_regels_id_seq OWNED BY public.brandstof_regels.id;


--
-- Name: bruikleen_overeenkomsten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bruikleen_overeenkomsten (
    id integer NOT NULL,
    gereedschap_id integer NOT NULL,
    medewerker_id integer NOT NULL,
    uitgegever_door_id integer,
    datum_uitgifte text NOT NULL,
    datum_inname text,
    staat_bij_uitgifte text,
    staat_bij_inname text,
    accessoires text,
    bruikleen_voorwaarden text,
    handtekening_medewerker_url text,
    handtekening_uitgever_url text,
    definitief boolean DEFAULT false NOT NULL,
    definitief_op timestamp without time zone,
    pdf_url text,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: bruikleen_overeenkomsten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bruikleen_overeenkomsten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bruikleen_overeenkomsten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bruikleen_overeenkomsten_id_seq OWNED BY public.bruikleen_overeenkomsten.id;


--
-- Name: calculatie_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calculatie_regels (
    id integer NOT NULL,
    calculatie_id integer NOT NULL,
    categorie text DEFAULT 'arbeid'::text NOT NULL,
    omschrijving text NOT NULL,
    eenheid text DEFAULT 'st'::text NOT NULL,
    hoeveelheid real DEFAULT 0 NOT NULL,
    stukprijs real DEFAULT 0 NOT NULL,
    totaal real DEFAULT 0 NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: calculatie_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.calculatie_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: calculatie_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.calculatie_regels_id_seq OWNED BY public.calculatie_regels.id;


--
-- Name: calculaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calculaties (
    id integer NOT NULL,
    naam text NOT NULL,
    gebouw_id integer,
    status text DEFAULT 'concept'::text NOT NULL,
    omschrijving text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: calculaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.calculaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: calculaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.calculaties_id_seq OWNED BY public.calculaties.id;


--
-- Name: chat_berichten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_berichten (
    id integer NOT NULL,
    gesprek_id integer NOT NULL,
    afzender_id integer,
    inhoud text NOT NULL,
    bijlage_url text,
    bijlage_type text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_berichten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_berichten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_berichten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_berichten_id_seq OWNED BY public.chat_berichten.id;


--
-- Name: chat_deelnemers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_deelnemers (
    id integer NOT NULL,
    gesprek_id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    gelezen_tot integer,
    joined_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_deelnemers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_deelnemers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_deelnemers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_deelnemers_id_seq OWNED BY public.chat_deelnemers.id;


--
-- Name: chat_gesprekken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_gesprekken (
    id integer NOT NULL,
    type text DEFAULT 'direct'::text NOT NULL,
    naam text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_gesprekken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_gesprekken_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_gesprekken_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_gesprekken_id_seq OWNED BY public.chat_gesprekken.id;


--
-- Name: clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clusters (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    verdieping_id integer,
    naam text NOT NULL,
    type text,
    kleur text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: clusters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clusters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clusters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clusters_id_seq OWNED BY public.clusters.id;


--
-- Name: compliance_signalen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_signalen (
    id integer NOT NULL,
    regel text NOT NULL,
    ernst text DEFAULT 'waarschuwing'::text NOT NULL,
    entiteit_type text NOT NULL,
    entiteit_id integer,
    titel text NOT NULL,
    omschrijving text NOT NULL,
    dedup_sleutel text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opgelost_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: compliance_signalen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.compliance_signalen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: compliance_signalen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.compliance_signalen_id_seq OWNED BY public.compliance_signalen.id;


--
-- Name: constructie_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.constructie_templates (
    id integer NOT NULL,
    naam text NOT NULL,
    omschrijving text,
    onderdelen jsonb DEFAULT '[]'::jsonb NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: constructie_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.constructie_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: constructie_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.constructie_templates_id_seq OWNED BY public.constructie_templates.id;


--
-- Name: contract_besluiten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_besluiten (
    id integer NOT NULL,
    contract_id integer NOT NULL,
    medewerker_id integer NOT NULL,
    besluit text DEFAULT 'geen_besluit'::text NOT NULL,
    nieuw_eind_datum text,
    nieuw_salaris real,
    nieuw_arbeidsduur real,
    toelichting text,
    ai_samenvatting text,
    ai_aandachtspunten jsonb,
    ai_wettelijke_risicos jsonb,
    status text DEFAULT 'in_behandeling'::text NOT NULL,
    besloten_door_id integer,
    besloten_op timestamp without time zone,
    audittrail jsonb DEFAULT '[]'::jsonb NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contract_besluiten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contract_besluiten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contract_besluiten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contract_besluiten_id_seq OWNED BY public.contract_besluiten.id;


--
-- Name: contract_signaleringen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_signaleringen (
    id integer NOT NULL,
    contract_id integer NOT NULL,
    medewerker_id integer NOT NULL,
    type text NOT NULL,
    ernst text DEFAULT 'info'::text NOT NULL,
    boodschap text NOT NULL,
    ai_advies text,
    status text DEFAULT 'nieuw'::text NOT NULL,
    gezien_door_id integer,
    gezien_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: contract_signaleringen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contract_signaleringen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contract_signaleringen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contract_signaleringen_id_seq OWNED BY public.contract_signaleringen.id;


--
-- Name: cqo_bevindingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cqo_bevindingen (
    id integer NOT NULL,
    run_id integer NOT NULL,
    specialist text NOT NULL,
    categorie text NOT NULL,
    ernst text NOT NULL,
    titel text NOT NULL,
    bevinding text NOT NULL,
    impact text,
    urgentie text,
    betrokken_modules text[],
    risico text,
    oplossing text,
    verwachte_verbetering text,
    positief boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cqo_bevindingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cqo_bevindingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cqo_bevindingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cqo_bevindingen_id_seq OWNED BY public.cqo_bevindingen.id;


--
-- Name: cqo_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cqo_runs (
    id integer NOT NULL,
    gestart_op timestamp without time zone DEFAULT now() NOT NULL,
    voltooid_op timestamp without time zone,
    status text DEFAULT 'lopend'::text NOT NULL,
    versie_label text,
    gestart_door integer NOT NULL,
    gestart_door_naam text NOT NULL,
    totaal_score numeric(5,2),
    release_status text,
    release_geblokkeerd boolean DEFAULT false NOT NULL,
    blokkering_reden text,
    categorie_scores jsonb,
    aantal_bevindingen integer,
    aantal_kritiek integer,
    aantal_hoog integer,
    aantal_verbeterpunten integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cqo_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cqo_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cqo_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cqo_runs_id_seq OWNED BY public.cqo_runs.id;


--
-- Name: cqo_verbeterpunten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cqo_verbeterpunten (
    id integer NOT NULL,
    run_id integer NOT NULL,
    specialist text NOT NULL,
    categorie text NOT NULL,
    urgentie text NOT NULL,
    titel text NOT NULL,
    probleem text NOT NULL,
    impact text,
    betrokken_modules text[],
    risico text,
    oplossing text NOT NULL,
    verwachte_verbetering text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: cqo_verbeterpunten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cqo_verbeterpunten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cqo_verbeterpunten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cqo_verbeterpunten_id_seq OWNED BY public.cqo_verbeterpunten.id;


--
-- Name: crm_commercieel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_commercieel (
    id integer NOT NULL,
    klant_id integer NOT NULL,
    gebouw_id integer,
    titel text NOT NULL,
    kans_type text DEFAULT 'offerte'::text,
    fase text DEFAULT 'signaal'::text NOT NULL,
    waarde real,
    kans integer DEFAULT 50,
    verwachte_datum text,
    verwachte_sluitdatum text,
    verantwoordelijke_id integer,
    concurrenten_betrokken text,
    volgende_actie text,
    ai_samenvatting text,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    bron_mail_message_id text,
    binnengekomen_op timestamp without time zone,
    beantwoord_op timestamp without time zone,
    bedrijf_bv text,
    gerelateerd_project_id integer
);


--
-- Name: crm_commercieel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_commercieel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_commercieel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_commercieel_id_seq OWNED BY public.crm_commercieel.id;


--
-- Name: crm_communicatie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_communicatie (
    id integer NOT NULL,
    klant_id integer NOT NULL,
    contactpersoon_id integer,
    type text DEFAULT 'notitie'::text NOT NULL,
    onderwerp text NOT NULL,
    inhoud text,
    datum text,
    gebruiker_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_communicatie_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_communicatie_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_communicatie_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_communicatie_id_seq OWNED BY public.crm_communicatie.id;


--
-- Name: crm_concurrenten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_concurrenten (
    id integer NOT NULL,
    naam text NOT NULL,
    website text,
    linkedin_url text,
    regio text,
    bekende_klanten text,
    bekende_projecttypes text,
    sterke_punten text,
    zwakke_punten text,
    where_we_encounter text,
    opmerkingen text,
    ai_samenvatting text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_concurrenten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_concurrenten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_concurrenten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_concurrenten_id_seq OWNED BY public.crm_concurrenten.id;


--
-- Name: crm_contactpersonen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_contactpersonen (
    id integer NOT NULL,
    klant_id integer,
    naam text NOT NULL,
    functie text,
    email text,
    telefoon text,
    mobiel text,
    linkedin_url text,
    beslisrol text DEFAULT 'onbekend'::text,
    relatiesterkte text DEFAULT 'onbekend'::text,
    primair boolean DEFAULT false NOT NULL,
    opmerkingen text,
    laatste_contact_datum text,
    volgende_actie text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_contactpersonen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_contactpersonen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_contactpersonen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_contactpersonen_id_seq OWNED BY public.crm_contactpersonen.id;


--
-- Name: crm_financieel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_financieel (
    id integer NOT NULL,
    klant_id integer NOT NULL,
    type text DEFAULT 'factuur'::text NOT NULL,
    omschrijving text,
    bedrag real,
    status text DEFAULT 'concept'::text NOT NULL,
    factuurnummer text,
    datum text,
    vervaldatum text,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_financieel_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_financieel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_financieel_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_financieel_id_seq OWNED BY public.crm_financieel.id;


--
-- Name: crm_klanten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_klanten (
    id integer NOT NULL,
    naam text NOT NULL,
    type text DEFAULT 'overig'::text,
    kvk text,
    adres text,
    postcode text,
    stad text,
    regio text,
    telefoon text,
    email text,
    website text,
    linkedin_url text,
    branche text,
    status text DEFAULT 'prospect'::text NOT NULL,
    relatie_status text DEFAULT 'onbekend'::text,
    voorkeur_fps_bedrijf text,
    opmerkingen text,
    voorkeurs_presentatie_niveau integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_klanten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_klanten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_klanten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_klanten_id_seq OWNED BY public.crm_klanten.id;


--
-- Name: crm_marktintelligentie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_marktintelligentie (
    id integer NOT NULL,
    type text DEFAULT 'nieuws'::text NOT NULL,
    bron_type text DEFAULT 'handmatig'::text NOT NULL,
    organisatie_id integer,
    concurrent_id integer,
    titel text NOT NULL,
    inhoud text,
    bron text,
    bron_url text,
    regio text,
    datum text,
    aangemaakt_door integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_marktintelligentie_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_marktintelligentie_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_marktintelligentie_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_marktintelligentie_id_seq OWNED BY public.crm_marktintelligentie.id;


--
-- Name: crm_opdrachten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_opdrachten (
    id integer NOT NULL,
    klant_id integer NOT NULL,
    gebouw_id integer,
    titel text NOT NULL,
    omschrijving text,
    status text DEFAULT 'nieuw'::text NOT NULL,
    waarde real,
    start_datum text,
    eind_datum text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_opdrachten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_opdrachten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_opdrachten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_opdrachten_id_seq OWNED BY public.crm_opdrachten.id;


--
-- Name: crm_relatievoorstellen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_relatievoorstellen (
    id integer NOT NULL,
    organisatie_id integer,
    type text DEFAULT 'contactpersoon'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    voorgestelde_data text,
    naam text,
    functie text,
    bron text,
    bron_url text,
    ai_toelichting text,
    aangemaakt_id integer,
    beoordeeld_door_id integer,
    beoordeeld_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_relatievoorstellen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_relatievoorstellen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_relatievoorstellen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_relatievoorstellen_id_seq OWNED BY public.crm_relatievoorstellen.id;


--
-- Name: crm_scout_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_scout_runs (
    id integer NOT NULL,
    gestart_op timestamp without time zone DEFAULT now() NOT NULL,
    afgerond_op timestamp without time zone,
    status text DEFAULT 'bezig'::text NOT NULL,
    gevonden integer DEFAULT 0,
    opgeslagen integer DEFAULT 0,
    foutmelding text
);


--
-- Name: crm_scout_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_scout_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_scout_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_scout_runs_id_seq OWNED BY public.crm_scout_runs.id;


--
-- Name: crm_taken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_taken (
    id integer NOT NULL,
    titel text NOT NULL,
    omschrijving text,
    status text DEFAULT 'open'::text NOT NULL,
    prioriteit text DEFAULT 'normaal'::text NOT NULL,
    vervaldatum text,
    toegewezen_aan_id integer,
    koppeling_type text,
    koppeling_id integer,
    aangemaakt_door_id integer,
    afgerond_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_taken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crm_taken_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crm_taken_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crm_taken_id_seq OWNED BY public.crm_taken.id;


--
-- Name: declaratie_beleid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.declaratie_beleid (
    id integer NOT NULL,
    inhoud text DEFAULT ''::text NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_door integer
);


--
-- Name: declaratie_beleid_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.declaratie_beleid_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: declaratie_beleid_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.declaratie_beleid_id_seq OWNED BY public.declaratie_beleid.id;


--
-- Name: declaraties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.declaraties (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    categorie text NOT NULL,
    omschrijving text NOT NULL,
    bedrag_totaal_cents integer NOT NULL,
    datum text NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    ingediend_op timestamp without time zone,
    beoordeeld_op timestamp without time zone,
    beoordeeld_door integer,
    afwijzingsreden text,
    verwerking_op timestamp without time zone,
    verwerkt_door integer,
    bijlage_pad text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: declaraties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.declaraties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: declaraties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.declaraties_id_seq OWNED BY public.declaraties.id;


--
-- Name: document_classificatie_correcties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_classificatie_correcties (
    id integer NOT NULL,
    bestandshash text,
    originele_categorie text NOT NULL,
    gecorrigeerde_categorie text NOT NULL,
    werkmaatschappij text,
    bewijs_signalen jsonb,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: document_classificatie_correcties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_classificatie_correcties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_classificatie_correcties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_classificatie_correcties_id_seq OWNED BY public.document_classificatie_correcties.id;


--
-- Name: document_goedkeuringen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_goedkeuringen (
    id integer NOT NULL,
    document_id integer NOT NULL,
    actie text NOT NULL,
    door_id integer,
    opmerking text,
    tijdstip timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: document_goedkeuringen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_goedkeuringen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_goedkeuringen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_goedkeuringen_id_seq OWNED BY public.document_goedkeuringen.id;


--
-- Name: document_koppelingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_koppelingen (
    id integer NOT NULL,
    document_id integer NOT NULL,
    doel_type text NOT NULL,
    doel_id integer NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_koppelingen_doel_type_check CHECK ((doel_type = ANY (ARRAY['gebouw'::text, 'klant'::text, 'offerte'::text, 'dossier'::text, 'voorziening'::text, 'opdracht'::text])))
);


--
-- Name: document_koppelingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_koppelingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_koppelingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_koppelingen_id_seq OWNED BY public.document_koppelingen.id;


--
-- Name: document_logboek; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_logboek (
    id integer NOT NULL,
    document_id integer,
    document_naam text,
    gebruiker_id integer,
    gebruiker_naam text,
    actie text NOT NULL,
    detail text,
    tijdstip timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: document_logboek_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_logboek_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_logboek_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_logboek_id_seq OWNED BY public.document_logboek.id;


--
-- Name: document_studio_modellen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_studio_modellen (
    id integer NOT NULL,
    werkgever_id integer NOT NULL,
    document_type text NOT NULL,
    naam text,
    status text DEFAULT 'geen'::text NOT NULL,
    referentie_bestand_pad text,
    connect_template_json text,
    versie integer DEFAULT 1 NOT NULL,
    goedgekeurd_op timestamp without time zone,
    goedgekeurd_door integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    gearchiveerd_op timestamp without time zone,
    aangemaakt_door integer
);


--
-- Name: document_studio_modellen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_studio_modellen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_studio_modellen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_studio_modellen_id_seq OWNED BY public.document_studio_modellen.id;


--
-- Name: document_toepassingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_toepassingen (
    id integer NOT NULL,
    document_id integer NOT NULL,
    label_id integer NOT NULL
);


--
-- Name: document_toepassingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_toepassingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_toepassingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_toepassingen_id_seq OWNED BY public.document_toepassingen.id;


--
-- Name: documenten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documenten (
    id integer NOT NULL,
    naam text NOT NULL,
    documenttype text DEFAULT 'testrapport'::text NOT NULL,
    fabrikant text,
    product text,
    en_norm text,
    rapportnummer text,
    revisie text,
    datum text,
    getest_voor text,
    pdf_url text,
    status text DEFAULT 'actueel'::text NOT NULL,
    groep_id text DEFAULT (gen_random_uuid())::text NOT NULL,
    revisie_nummer integer DEFAULT 1 NOT NULL,
    bestands_hash text,
    bestandsgrootte integer,
    geldig_tot date,
    goedkeuring_status text DEFAULT 'goedgekeurd'::text NOT NULL,
    ai_geanalyseerd boolean DEFAULT false NOT NULL,
    ai_metadata jsonb,
    gearchiveerd boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: documenten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documenten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documenten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documenten_id_seq OWNED BY public.documenten.id;


--
-- Name: dossier_documenten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossier_documenten (
    id integer NOT NULL,
    dossier_id integer NOT NULL,
    document_id integer,
    naam text NOT NULL,
    bestand_url text,
    categorie text,
    status text DEFAULT 'concept'::text NOT NULL,
    versie integer DEFAULT 1 NOT NULL,
    toegevoegd_door_id integer,
    bevroren_revisie_nummer integer,
    bevroren_pdf_url text,
    bevroren_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: dossier_documenten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dossier_documenten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dossier_documenten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dossier_documenten_id_seq OWNED BY public.dossier_documenten.id;


--
-- Name: dossiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dossiers (
    id integer NOT NULL,
    type text DEFAULT 'project'::text NOT NULL,
    gebouw_id integer,
    naam text NOT NULL,
    omschrijving text,
    status text DEFAULT 'concept'::text NOT NULL,
    definitief_op timestamp without time zone,
    gearchiveerd_op timestamp without time zone,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: dossiers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dossiers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dossiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dossiers_id_seq OWNED BY public.dossiers.id;


--
-- Name: eenheidsprijzen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.eenheidsprijzen (
    id integer NOT NULL,
    code text NOT NULL,
    omschrijving text NOT NULL,
    categorie text NOT NULL,
    eenheid text NOT NULL,
    materiaalcomponent real DEFAULT 0 NOT NULL,
    arbeidscomponent real DEFAULT 0 NOT NULL,
    normtijd real DEFAULT 0 NOT NULL,
    kostprijs real DEFAULT 0 NOT NULL,
    verkoopprijs real DEFAULT 0 NOT NULL,
    marge real DEFAULT 0 NOT NULL,
    btw_code text,
    geldig_vanaf text,
    actief boolean DEFAULT true NOT NULL,
    opmerkingen text,
    inclusies text,
    exclusies text,
    prijsbasis_opmerking text,
    gem_werkelijk_uren real,
    gem_werkelijk_materiaal real,
    aantal_keer_gebruikt integer DEFAULT 0 NOT NULL,
    afwijking_normtijd real,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: eenheidsprijzen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.eenheidsprijzen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: eenheidsprijzen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.eenheidsprijzen_id_seq OWNED BY public.eenheidsprijzen.id;


--
-- Name: fabrikanten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fabrikanten (
    id integer NOT NULL,
    naam text NOT NULL,
    url text,
    gearchiveerd boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fabrikanten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fabrikanten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fabrikanten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fabrikanten_id_seq OWNED BY public.fabrikanten.id;


--
-- Name: facturen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facturen (
    id integer NOT NULL,
    type text DEFAULT 'inkoop'::text NOT NULL,
    factuurnummer text,
    factuurdatum text,
    vervaldatum text,
    omschrijving text,
    relatienaam text,
    relatie_code text,
    relatie_adres text,
    bedrag_excl_btw numeric(12,2),
    btw_bedrag numeric(12,2),
    bedrag_incl_btw numeric(12,2),
    btw_code text,
    grootboekrekening text,
    kostenplaats text,
    dagboek text,
    project_code text,
    pdf_url text,
    bestandsnaam text,
    gebouw_id integer,
    leverancier_id integer,
    project_id integer,
    ai_metadata jsonb,
    status text DEFAULT 'ontvangen'::text NOT NULL,
    geblokkeerd boolean DEFAULT false NOT NULL,
    blokkering_reden text,
    afkeuring_reden text,
    afgekeurd_op timestamp without time zone,
    afgekeurd_door integer,
    accountview_boeking_id text,
    accountview_export_op timestamp without time zone,
    accountview_status text,
    accountview_fout text,
    payload_hash text,
    betaalstatus text,
    betaaldatum text,
    boekingsnummer text,
    terugkoppeling_op timestamp without time zone,
    herexport_op timestamp without time zone,
    herexport_door integer,
    herexport_reden text,
    ai_gelezen boolean DEFAULT false NOT NULL,
    ai_vertrouwen real,
    opmerkingen text,
    accordering_status text,
    accordering_door_id integer,
    accordering_op timestamp without time zone,
    betaald_op timestamp without time zone,
    uploader_id integer,
    geaccordeerd boolean DEFAULT false NOT NULL,
    geaccordeerd_op timestamp without time zone,
    geaccordeerd_door integer,
    beoordelaar_id integer,
    opdracht_id integer,
    inkoopbon_id integer,
    categorie text,
    voorstel_bron text,
    voorstel_bron_id integer,
    g_rekening_van_toepassing boolean DEFAULT false NOT NULL,
    g_rekening_bedrag numeric(12,2),
    normaal_bedrag numeric(12,2),
    iban_uitgelezen text,
    iban_afwijking boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    subtype text,
    incasso_datum text,
    incasso_referentie text,
    bron text DEFAULT 'handmatig'::text NOT NULL,
    afkeur_categorie text,
    onderhoudscontract_id integer,
    tenaamstelling_bv text,
    afwijsreden_code text,
    inkoper_id integer,
    inkoper_bevestigd_op timestamp without time zone,
    onzekere_velden jsonb,
    ai_voorstel_stroom jsonb,
    conversation_id text,
    mail_message_id text,
    status_voor_afwijzing text
);


--
-- Name: facturen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.facturen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: facturen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.facturen_id_seq OWNED BY public.facturen.id;


--
-- Name: factuur_correspondentie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_correspondentie (
    id integer NOT NULL,
    factuur_id integer NOT NULL,
    richting text DEFAULT 'uitgaand'::text NOT NULL,
    soort text DEFAULT 'afkeur'::text NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    ontvanger_email text,
    ontvanger_naam text,
    onderwerp text NOT NULL,
    bericht text NOT NULL,
    afkeur_categorie text,
    ai_gegenereerd boolean DEFAULT false NOT NULL,
    opgesteld_door integer,
    verzonden_door integer,
    verzonden_op timestamp without time zone,
    foutmelding text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: factuur_correspondentie_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_correspondentie_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_correspondentie_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_correspondentie_id_seq OWNED BY public.factuur_correspondentie.id;


--
-- Name: factuur_herinneringen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_herinneringen (
    id integer NOT NULL,
    factuur_id integer NOT NULL,
    gebruiker_id integer,
    type text NOT NULL,
    verstuurd_op timestamp without time zone,
    ontvanger_email text,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: factuur_herinneringen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_herinneringen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_herinneringen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_herinneringen_id_seq OWNED BY public.factuur_herinneringen.id;


--
-- Name: factuur_import_instellingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_import_instellingen (
    id integer NOT NULL,
    actief boolean DEFAULT false NOT NULL,
    mailbox_adres text,
    laatste_sync_op timestamp without time zone,
    laatste_sync_resultaat text,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: factuur_import_instellingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_import_instellingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_import_instellingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_import_instellingen_id_seq OWNED BY public.factuur_import_instellingen.id;


--
-- Name: factuur_import_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_import_log (
    id integer NOT NULL,
    message_id text NOT NULL,
    bijlage_naam text NOT NULL,
    bijlage_hash text,
    formaat text,
    afzender text,
    onderwerp text,
    factuur_id integer,
    status text DEFAULT 'verwerkt'::text NOT NULL,
    foutmelding text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: factuur_import_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_import_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_import_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_import_log_id_seq OWNED BY public.factuur_import_log.id;


--
-- Name: factuur_opmerkingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_opmerkingen (
    id integer NOT NULL,
    factuur_id integer NOT NULL,
    gebruiker_id integer,
    tekst text NOT NULL,
    reply_op_id integer,
    afgehandeld boolean DEFAULT false NOT NULL,
    afgehandeld_op timestamp without time zone,
    afgehandeld_door integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: factuur_opmerkingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_opmerkingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_opmerkingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_opmerkingen_id_seq OWNED BY public.factuur_opmerkingen.id;


--
-- Name: factuur_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_regels (
    id integer NOT NULL,
    factuur_id integer NOT NULL,
    regelnummer integer DEFAULT 1 NOT NULL,
    omschrijving text NOT NULL,
    hoeveelheid real,
    eenheid text,
    stukprijs numeric(12,2),
    bedrag_excl_btw numeric(12,2),
    btw_code text,
    btw_percentage real,
    btw_bedrag numeric(12,2),
    grootboekrekening text,
    kostenplaats text,
    categorie text,
    inkoopbon_regel_id integer,
    bron text DEFAULT 'handmatig'::text NOT NULL,
    ai_vertrouwen real,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: factuur_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_regels_id_seq OWNED BY public.factuur_regels.id;


--
-- Name: factuur_signalen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_signalen (
    id integer NOT NULL,
    type text NOT NULL,
    factuur_id integer,
    mail_message_id text,
    omschrijving text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    afgehandeld_door integer,
    afgehandeld_op timestamp without time zone,
    afhandel_notitie text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    projectkans_id integer
);


--
-- Name: factuur_signalen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_signalen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_signalen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_signalen_id_seq OWNED BY public.factuur_signalen.id;


--
-- Name: factuur_termijnen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_termijnen (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    volgnummer integer NOT NULL,
    omschrijving text,
    percentage real,
    bedrag numeric(12,2),
    status text DEFAULT 'gepland'::text NOT NULL,
    factuur_id integer,
    vervaldatum text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: factuur_termijnen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_termijnen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_termijnen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_termijnen_id_seq OWNED BY public.factuur_termijnen.id;


--
-- Name: factuur_tijdlijn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factuur_tijdlijn (
    id integer NOT NULL,
    factuur_id integer NOT NULL,
    tekst text NOT NULL,
    gebeurd_op timestamp without time zone DEFAULT now() NOT NULL,
    gebruiker_naam text
);


--
-- Name: factuur_tijdlijn_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.factuur_tijdlijn_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: factuur_tijdlijn_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.factuur_tijdlijn_id_seq OWNED BY public.factuur_tijdlijn.id;


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id integer NOT NULL,
    gebruiker_id integer,
    naam text,
    type text DEFAULT 'algemeen'::text NOT NULL,
    waardering integer,
    bericht text NOT NULL,
    pagina text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_id_seq OWNED BY public.feedback.id;


--
-- Name: feestdagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feestdagen (
    id integer NOT NULL,
    werkgever_id integer,
    jaar integer NOT NULL,
    datum text NOT NULL,
    naam text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: feestdagen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feestdagen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feestdagen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feestdagen_id_seq OWNED BY public.feestdagen.id;


--
-- Name: fie_ak_posten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fie_ak_posten (
    id integer NOT NULL,
    begroting_id integer NOT NULL,
    werkgever_id integer,
    categorie text DEFAULT 'overig'::text NOT NULL,
    omschrijving text NOT NULL,
    bedrag_jaarbasis real DEFAULT 0 NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fie_ak_posten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fie_ak_posten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fie_ak_posten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fie_ak_posten_id_seq OWNED BY public.fie_ak_posten.id;


--
-- Name: fie_capaciteit_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fie_capaciteit_snapshots (
    id integer NOT NULL,
    boekjaar integer NOT NULL,
    werkgever_id integer,
    productieve_uren real DEFAULT 0 NOT NULL,
    fte real DEFAULT 0,
    snapshot_datum text NOT NULL,
    bron text DEFAULT 'handmatig'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fie_capaciteit_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fie_capaciteit_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fie_capaciteit_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fie_capaciteit_snapshots_id_seq OWNED BY public.fie_capaciteit_snapshots.id;


--
-- Name: fie_jaarbegrotingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fie_jaarbegrotingen (
    id integer NOT NULL,
    boekjaar integer NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    omzet_doel real,
    directe_kosten_doel real,
    doel_marge_pct real DEFAULT 15 NOT NULL,
    ak_per_productief_uur real,
    productieve_uren_doel integer,
    verdeelsleutel text DEFAULT 'uren'::text NOT NULL,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fie_jaarbegrotingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fie_jaarbegrotingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fie_jaarbegrotingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fie_jaarbegrotingen_id_seq OWNED BY public.fie_jaarbegrotingen.id;


--
-- Name: fie_leermomenten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fie_leermomenten (
    id integer NOT NULL,
    werktype text NOT NULL,
    afwijking_pct_arbeid real DEFAULT 0 NOT NULL,
    afwijking_pct_materiaal real DEFAULT 0 NOT NULL,
    gebaseerd_op_n_projecten integer DEFAULT 0 NOT NULL,
    correctie_factor real DEFAULT 1 NOT NULL,
    opmerkingen text,
    laatste_update timestamp without time zone DEFAULT now() NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fie_leermomenten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fie_leermomenten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fie_leermomenten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fie_leermomenten_id_seq OWNED BY public.fie_leermomenten.id;


--
-- Name: fie_nacalculaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fie_nacalculaties (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    werktype text DEFAULT 'algemeen'::text NOT NULL,
    calc_arbeid_uren real DEFAULT 0,
    werkelijk_arbeid_uren real DEFAULT 0,
    afwijking_pct_arbeid real,
    calc_arbeid_bedrag real DEFAULT 0,
    werkelijk_arbeid_bedrag real DEFAULT 0,
    afwijking_pct_arbeid_bedrag real,
    calc_materiaal_bedrag real DEFAULT 0,
    werkelijk_materiaal_bedrag real DEFAULT 0,
    afwijking_pct_materiaal real,
    calc_onderaanneming_bedrag real DEFAULT 0,
    werkelijk_onderaanneming_bedrag real DEFAULT 0,
    afwijking_pct_onderaanneming real,
    afgesloten boolean DEFAULT false NOT NULL,
    berekend_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    werktype_bron text
);


--
-- Name: fie_nacalculaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fie_nacalculaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fie_nacalculaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fie_nacalculaties_id_seq OWNED BY public.fie_nacalculaties.id;


--
-- Name: fie_observaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fie_observaties (
    id integer NOT NULL,
    boekjaar integer NOT NULL,
    type text NOT NULL,
    ernst text DEFAULT 'info'::text NOT NULL,
    omschrijving text NOT NULL,
    waarde real,
    drempelwaarde real,
    afwijking_pct real,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fie_observaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fie_observaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fie_observaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fie_observaties_id_seq OWNED BY public.fie_observaties.id;


--
-- Name: financiele_contract_kosten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiele_contract_kosten (
    id integer NOT NULL,
    contract_id integer NOT NULL,
    jaar integer NOT NULL,
    bedrag real NOT NULL,
    bron text DEFAULT 'handmatig'::text NOT NULL,
    document_id integer,
    notitie text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: financiele_contract_kosten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financiele_contract_kosten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financiele_contract_kosten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financiele_contract_kosten_id_seq OWNED BY public.financiele_contract_kosten.id;


--
-- Name: financiele_contract_signaleringen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiele_contract_signaleringen (
    id integer NOT NULL,
    contract_id integer NOT NULL,
    type text NOT NULL,
    ernst text DEFAULT 'info'::text NOT NULL,
    boodschap text NOT NULL,
    ai_advies text,
    bedrag real,
    zekerheid text,
    dedupe_sleutel text NOT NULL,
    status text DEFAULT 'nieuw'::text NOT NULL,
    gezien_door_id integer,
    gezien_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: financiele_contract_signaleringen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financiele_contract_signaleringen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financiele_contract_signaleringen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financiele_contract_signaleringen_id_seq OWNED BY public.financiele_contract_signaleringen.id;


--
-- Name: financiele_contracten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiele_contracten (
    id integer NOT NULL,
    categorie text DEFAULT 'overig'::text NOT NULL,
    naam text NOT NULL,
    leverancier text,
    werkgever_id integer,
    contractnummer text,
    ingangsdatum date,
    einddatum date,
    opzegtermijn_maanden integer,
    kosten_bedrag real,
    kosten_periode text DEFAULT 'jaar'::text NOT NULL,
    indexering_percentage real,
    indexering_maand integer,
    contractwaarde real,
    automatische_verlenging boolean DEFAULT true NOT NULL,
    verlengingsduur_maanden integer,
    aantal_licenties integer,
    aantal_in_gebruik integer,
    laatst_gebruikt_op date,
    status text DEFAULT 'actief'::text NOT NULL,
    document_id integer,
    notities text,
    ai_samenvatting text,
    ai_analyse jsonb,
    ai_geanalyseerd_op timestamp without time zone,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: financiele_contracten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financiele_contracten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financiele_contracten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financiele_contracten_id_seq OWNED BY public.financiele_contracten.id;


--
-- Name: financiele_document_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiele_document_log (
    id integer NOT NULL,
    document_id integer,
    actie text NOT NULL,
    gebruiker_id integer,
    details text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: financiele_document_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financiele_document_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financiele_document_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financiele_document_log_id_seq OWNED BY public.financiele_document_log.id;


--
-- Name: financiele_documenten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiele_documenten (
    id integer NOT NULL,
    bestandsnaam text NOT NULL,
    titel text NOT NULL,
    bestandspad text NOT NULL,
    bestandsgrootte integer,
    mimetype text DEFAULT 'application/octet-stream'::text NOT NULL,
    bestands_hash text,
    documenttype text DEFAULT 'jaarrekening'::text NOT NULL,
    entiteit text,
    boekjaar integer,
    subtype text DEFAULT 'enkelvoudig'::text NOT NULL,
    documentstatus text DEFAULT 'onbekend'::text NOT NULL,
    beveiligingsprofiel text DEFAULT 'FINANCIAL_CONFIDENTIAL'::text NOT NULL,
    opslaglocatie text NOT NULL,
    classificatie_methode text DEFAULT 'heuristiek'::text NOT NULL,
    betrouwbaarheid text DEFAULT 'laag'::text NOT NULL,
    betrouwbaarheid_score integer DEFAULT 0 NOT NULL,
    ai_bewijs jsonb,
    gevonden_gegevens jsonb,
    extractie_status text DEFAULT 'niet_gestart'::text NOT NULL,
    dataset_status text DEFAULT 'proposed'::text NOT NULL,
    vervangt_document_id integer,
    is_actueel boolean DEFAULT true NOT NULL,
    geupload_door integer,
    geupload_op timestamp without time zone DEFAULT now() NOT NULL,
    goedgekeurd_door integer,
    goedgekeurd_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT financiele_documenten_dataset_status_check CHECK ((dataset_status = ANY (ARRAY['proposed'::text, 'reviewed'::text, 'approved'::text, 'rejected'::text, 'superseded'::text]))),
    CONSTRAINT financiele_documenten_documentstatus_check CHECK ((documentstatus = ANY (ARRAY['definitief'::text, 'concept'::text, 'onbekend'::text]))),
    CONSTRAINT financiele_documenten_subtype_check CHECK ((subtype = ANY (ARRAY['geconsolideerd'::text, 'enkelvoudig'::text])))
);


--
-- Name: financiele_documenten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financiele_documenten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financiele_documenten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financiele_documenten_id_seq OWNED BY public.financiele_documenten.id;


--
-- Name: financiele_kerncijfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financiele_kerncijfers (
    id integer NOT NULL,
    document_id integer NOT NULL,
    entiteit text,
    boekjaar integer,
    geconsolideerd boolean DEFAULT false NOT NULL,
    sleutel text NOT NULL,
    label text NOT NULL,
    waarde numeric,
    eenheid text DEFAULT 'euro'::text NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    is_berekend boolean DEFAULT false NOT NULL,
    uitgesloten boolean DEFAULT false NOT NULL,
    handmatig_aangepast boolean DEFAULT false NOT NULL,
    oorspronkelijke_waarde numeric,
    bron_pagina integer,
    bron_tabel text,
    bron_tekst text,
    extractie_methode text DEFAULT 'heuristiek'::text NOT NULL,
    confidence numeric,
    beoordeeld_door integer,
    beoordeeld_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT financiele_kerncijfers_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'reviewed'::text, 'approved'::text, 'rejected'::text, 'superseded'::text])))
);


--
-- Name: financiele_kerncijfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.financiele_kerncijfers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: financiele_kerncijfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.financiele_kerncijfers_id_seq OWNED BY public.financiele_kerncijfers.id;


--
-- Name: fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fotos (
    id integer NOT NULL,
    voorziening_id integer NOT NULL,
    fase text NOT NULL,
    url text NOT NULL,
    beschrijving text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fotos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fotos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fotos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fotos_id_seq OWNED BY public.fotos.id;


--
-- Name: fps_bedrijfsstandaarden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fps_bedrijfsstandaarden (
    id integer NOT NULL,
    sleutel text NOT NULL,
    categorie text NOT NULL,
    titel text NOT NULL,
    inhoud text NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fps_bedrijfsstandaarden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fps_bedrijfsstandaarden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fps_bedrijfsstandaarden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fps_bedrijfsstandaarden_id_seq OWNED BY public.fps_bedrijfsstandaarden.id;


--
-- Name: fps_visual_annotaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fps_visual_annotaties (
    id integer NOT NULL,
    originele_foto_path text NOT NULL,
    annotatie_path text NOT NULL,
    context text NOT NULL,
    afwijking_status text NOT NULL,
    bevindingen text[],
    pim_stap_id integer,
    gegenereerd_door_model text,
    gegenereerd_op timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fps_visual_annotaties_paden_check CHECK ((originele_foto_path <> annotatie_path))
);


--
-- Name: fps_visual_annotaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fps_visual_annotaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fps_visual_annotaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fps_visual_annotaties_id_seq OWNED BY public.fps_visual_annotaties.id;


--
-- Name: fps_visuals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fps_visuals (
    id integer NOT NULL,
    naam text NOT NULL,
    visual_type text NOT NULL,
    bron_type text NOT NULL,
    bron_referentie text,
    object_path text NOT NULL,
    thumbnail_path text,
    spot_type text[] DEFAULT '{}'::text[] NOT NULL,
    artikel_id integer,
    bedrijfsstandaard_id integer,
    taal text DEFAULT 'nl'::text NOT NULL,
    actief boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp with time zone,
    CONSTRAINT fps_visuals_bron_type_check CHECK ((bron_type = ANY (ARRAY['projecttekening'::text, 'ETA'::text, 'DoP'::text, 'montagevoorschrift'::text, 'fps_standaard'::text, 'praktijkfoto'::text, 'productblad'::text])))
);


--
-- Name: fps_visuals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fps_visuals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fps_visuals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fps_visuals_id_seq OWNED BY public.fps_visuals.id;


--
-- Name: functie_opleidingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.functie_opleidingen (
    id integer NOT NULL,
    functie_id integer NOT NULL,
    opleiding_id integer NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: functie_opleidingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.functie_opleidingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: functie_opleidingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.functie_opleidingen_id_seq OWNED BY public.functie_opleidingen.id;


--
-- Name: functies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.functies (
    id integer NOT NULL,
    werkmaatschappij text DEFAULT 'FPS Brandpreventie'::text NOT NULL,
    werkgever_id integer,
    naam text NOT NULL,
    omschrijving text,
    taken text,
    verantwoordelijkheden text,
    competenties text,
    opleidingsvereisten text,
    doorgroeipad text,
    uitvoerend boolean DEFAULT false NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    minimale_bezetting integer,
    profiel_id integer
);


--
-- Name: functies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.functies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: functies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.functies_id_seq OWNED BY public.functies.id;


--
-- Name: gebouw_email_bijlagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebouw_email_bijlagen (
    id integer NOT NULL,
    email_id integer NOT NULL,
    bestandsnaam text NOT NULL,
    object_pad text,
    content_type text,
    grootte integer
);


--
-- Name: gebouw_email_bijlagen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebouw_email_bijlagen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebouw_email_bijlagen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebouw_email_bijlagen_id_seq OWNED BY public.gebouw_email_bijlagen.id;


--
-- Name: gebouw_email_samenvattingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebouw_email_samenvattingen (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    opdrachtomschrijving text,
    opdrachtgever text,
    contactgegevens text,
    afspraken text,
    actiepunten text,
    besluiten text,
    tekeningen text,
    risicos text,
    contactpersonen jsonb DEFAULT '[]'::jsonb NOT NULL,
    aantal_emails integer DEFAULT 0 NOT NULL,
    geverifieerd boolean DEFAULT false NOT NULL,
    gecontroleerd_door text,
    gecontroleerd_op timestamp without time zone,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gebouw_email_samenvattingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebouw_email_samenvattingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebouw_email_samenvattingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebouw_email_samenvattingen_id_seq OWNED BY public.gebouw_email_samenvattingen.id;


--
-- Name: gebouw_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebouw_emails (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    bestandsnaam text NOT NULL,
    object_pad text,
    afzender text,
    ontvanger text,
    onderwerp text,
    datum text,
    inhoud_tekst text,
    ai_omschrijving text,
    ai_naw text,
    ai_contactinfo text,
    ai_tekeningen text,
    ai_actiepunten text,
    ai_relevant boolean,
    ai_relevant_reden text,
    status text DEFAULT 'in_behandeling'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gebouw_emails_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebouw_emails_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebouw_emails_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebouw_emails_id_seq OWNED BY public.gebouw_emails.id;


--
-- Name: gebouw_partijen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebouw_partijen (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    type text NOT NULL,
    naam text NOT NULL,
    organisatie text,
    telefoon text,
    email text,
    website text,
    adres text,
    postcode text,
    plaats text,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gebouw_partijen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebouw_partijen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebouw_partijen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebouw_partijen_id_seq OWNED BY public.gebouw_partijen.id;


--
-- Name: gebouw_publicaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebouw_publicaties (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    status text DEFAULT 'gepubliceerd'::text NOT NULL,
    gepubliceerd_door integer,
    gepubliceerd_op timestamp without time zone DEFAULT now() NOT NULL,
    ingetrokken_door integer,
    ingetrokken_op timestamp without time zone,
    notitie text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gebouw_publicaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebouw_publicaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebouw_publicaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebouw_publicaties_id_seq OWNED BY public.gebouw_publicaties.id;


--
-- Name: gebouw_toewijzingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebouw_toewijzingen (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    project_rol text
);


--
-- Name: gebouw_toewijzingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebouw_toewijzingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebouw_toewijzingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebouw_toewijzingen_id_seq OWNED BY public.gebouw_toewijzingen.id;


--
-- Name: gebouwen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebouwen (
    id integer NOT NULL,
    werknummer text,
    projectnummer text,
    naam text NOT NULL,
    adres text NOT NULL,
    stad text,
    postcode text,
    omschrijving text,
    klant_id integer,
    aantal_verdiepingen integer,
    hoogte real,
    breedte real,
    diepte real,
    oppervlakte real,
    gebouw_type text,
    latitude real,
    longitude real,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    gereed_op timestamp without time zone,
    gereed_door text,
    gearchiveerd boolean DEFAULT false NOT NULL,
    gearchiveerd_op timestamp without time zone,
    werkgever_id integer,
    project_status text,
    galerij_upload_toegestaan boolean DEFAULT false NOT NULL
);


--
-- Name: gebouwen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebouwen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebouwen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebouwen_id_seq OWNED BY public.gebouwen.id;


--
-- Name: gebruiker_profielen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebruiker_profielen (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    profiel_id integer NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gebruiker_profielen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebruiker_profielen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebruiker_profielen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebruiker_profielen_id_seq OWNED BY public.gebruiker_profielen.id;


--
-- Name: gebruikers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebruikers (
    id integer NOT NULL,
    naam text NOT NULL,
    email text NOT NULL,
    rol text DEFAULT 'gebruiker'::text NOT NULL,
    telefoon text,
    bedrijf text,
    wachtwoord text,
    totp_secret text,
    twee_factor_ingeschakeld boolean DEFAULT false NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    gearchiveerd boolean DEFAULT false NOT NULL,
    is_hoofdtester boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    laatst_online timestamp without time zone,
    avatar_url text,
    bedrijfslogo_url text,
    bedrijfskleuren text,
    uitnodiging_status text DEFAULT 'niet_uitgenodigd'::text NOT NULL,
    uitnodiging_verstuurd_op timestamp without time zone,
    uitnodiging_token text,
    uitnodiging_verloopt_op timestamp without time zone,
    uitnodiging_geopend_op timestamp without time zone,
    uitnodiging_opnieuw_verstuurd_op timestamp without time zone,
    uitnodiging_geaccepteerd_op timestamp without time zone,
    taal text DEFAULT 'nl'::text NOT NULL,
    functietitels text[] DEFAULT '{}'::text[] NOT NULL,
    bevoegdheden jsonb DEFAULT '{}'::jsonb NOT NULL,
    herkomst_profiel_id integer,
    herkomst_automatisch boolean DEFAULT false NOT NULL,
    dienstverband text DEFAULT 'intern'::text NOT NULL,
    bedrijf_uitzendbureau text,
    geanonimiseerd text,
    token_versie integer DEFAULT 0 NOT NULL,
    moet_wachtwoord_wijzigen boolean DEFAULT false NOT NULL,
    mislukte_pogingen integer DEFAULT 0 NOT NULL,
    vergrendeld_tot timestamp without time zone,
    gedeactiveerd_op timestamp without time zone,
    uitzendbureau_id integer
);


--
-- Name: gebruikers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebruikers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebruikers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebruikers_id_seq OWNED BY public.gebruikers.id;


--
-- Name: gebruikers_meldingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gebruikers_meldingen (
    id integer NOT NULL,
    type text NOT NULL,
    omschrijving text NOT NULL,
    urgentie text DEFAULT 'normaal'::text NOT NULL,
    status text DEFAULT 'nieuw'::text NOT NULL,
    gebruiker_id integer,
    gebruiker_naam text,
    gebruiker_rol text,
    pagina text,
    browser_info text,
    screenshot_data text,
    tech_context_toestemming boolean DEFAULT false NOT NULL,
    tech_context text,
    ai_reactie text,
    ai_classificatie text,
    ai_workaround text,
    interne_notitie text,
    behandeld_door integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone
);


--
-- Name: gebruikers_meldingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gebruikers_meldingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gebruikers_meldingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gebruikers_meldingen_id_seq OWNED BY public.gebruikers_meldingen.id;


--
-- Name: gereedschap_meldingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gereedschap_meldingen (
    id integer NOT NULL,
    gereedschap_id integer NOT NULL,
    gemeld_door_medewerker_id integer,
    gemeld_door_gebruiker_id integer,
    soort_melding text DEFAULT 'defect'::text NOT NULL,
    omschrijving text NOT NULL,
    urgentie text DEFAULT 'normaal'::text NOT NULL,
    kan_nog_veilig_gebruikt_worden boolean,
    datum_melding text NOT NULL,
    status text DEFAULT 'nieuw'::text NOT NULL,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: gereedschap_meldingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gereedschap_meldingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gereedschap_meldingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gereedschap_meldingen_id_seq OWNED BY public.gereedschap_meldingen.id;


--
-- Name: gereedschappen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gereedschappen (
    id integer NOT NULL,
    volgnummer text NOT NULL,
    gegraveerd_nummer text,
    omschrijving text NOT NULL,
    merk text,
    type text,
    serienummer text,
    categorie text DEFAULT 'overig'::text NOT NULL,
    aandrijving text DEFAULT 'handgereedschap'::text NOT NULL,
    met_snoer boolean DEFAULT false NOT NULL,
    accu_inbegrepen boolean DEFAULT false NOT NULL,
    lader_inbegrepen boolean DEFAULT false NOT NULL,
    koffer_inbegrepen boolean DEFAULT false NOT NULL,
    aankoopdatum text,
    aankoopprijs real,
    leverancier text,
    garantietermijn text,
    status text DEFAULT 'Beschikbaar'::text NOT NULL,
    huidige_medewerker_id integer,
    locatie text,
    keuringsplichtig boolean DEFAULT false NOT NULL,
    laatste_keuring text,
    volgende_keuring text,
    opmerkingen text,
    foto_url text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    keuring_norm text,
    keuring_verval_datum timestamp without time zone
);


--
-- Name: gereedschappen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gereedschappen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gereedschappen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gereedschappen_id_seq OWNED BY public.gereedschappen.id;


--
-- Name: go_live_adviezen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.go_live_adviezen (
    id integer NOT NULL,
    titel text NOT NULL,
    inhoud text NOT NULL,
    reden text,
    impact text,
    risico text,
    tijdwinst_uur integer,
    afhankelijkheden text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    context_json jsonb,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: go_live_adviezen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.go_live_adviezen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: go_live_adviezen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.go_live_adviezen_id_seq OWNED BY public.go_live_adviezen.id;


--
-- Name: go_live_fasen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.go_live_fasen (
    id integer NOT NULL,
    sleutel text NOT NULL,
    naam text NOT NULL,
    beschrijving text,
    doel text,
    afhankelijkheden text[] DEFAULT '{}'::text[] NOT NULL,
    verantwoordelijke text,
    geschatte_uren integer,
    status text DEFAULT 'open'::text NOT NULL,
    voortgang_pct integer DEFAULT 0 NOT NULL,
    opmerkingen text,
    risico text,
    volgorde integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: go_live_fasen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.go_live_fasen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: go_live_fasen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.go_live_fasen_id_seq OWNED BY public.go_live_fasen.id;


--
-- Name: go_live_lessen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.go_live_lessen (
    id integer NOT NULL,
    fase_sleutel text NOT NULL,
    omschrijving text NOT NULL,
    tijd_koste_uur integer,
    aantal_keer integer DEFAULT 1 NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: go_live_lessen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.go_live_lessen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: go_live_lessen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.go_live_lessen_id_seq OWNED BY public.go_live_lessen.id;


--
-- Name: goedkeuring_aanvragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goedkeuring_aanvragen (
    id integer NOT NULL,
    object_type text NOT NULL,
    object_id integer NOT NULL,
    document_type text NOT NULL,
    omschrijving text,
    bedrag real,
    werkmaatschappij_id integer,
    status text DEFAULT 'concept'::text NOT NULL,
    beleidsregel_id integer,
    beleid_snapshot jsonb,
    vereiste_goedkeuringen integer DEFAULT 1 NOT NULL,
    ontvangen_goedkeuringen integer DEFAULT 0 NOT NULL,
    ingediend_door_id integer,
    ingediend_op timestamp without time zone,
    afgehandeld_op timestamp without time zone,
    afwijzing_reden text,
    vervangen_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: goedkeuring_aanvragen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goedkeuring_aanvragen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goedkeuring_aanvragen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goedkeuring_aanvragen_id_seq OWNED BY public.goedkeuring_aanvragen.id;


--
-- Name: goedkeuring_beleidsregels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goedkeuring_beleidsregels (
    id integer NOT NULL,
    naam text NOT NULL,
    document_type text NOT NULL,
    werkmaatschappij_id integer,
    ondergrens real,
    bovengrens real,
    goedkeurder_gebruiker_id integer,
    goedkeurder_module text,
    goedkeurder_min_niveau integer,
    aantal_goedkeuringen_vereist integer DEFAULT 1 NOT NULL,
    vier_ogen_verplicht boolean DEFAULT true NOT NULL,
    vervanger_gebruiker_id integer,
    reactietermijn_uren integer,
    herinnering_uren integer,
    escalatie_stap_1_uren integer,
    escalatie_stap_1_gebruiker_id integer,
    escalatie_stap_2_uren integer,
    escalatie_stap_2_gebruiker_id integer,
    max_doorlooptijd_uren integer,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: goedkeuring_beleidsregels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goedkeuring_beleidsregels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goedkeuring_beleidsregels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goedkeuring_beleidsregels_id_seq OWNED BY public.goedkeuring_beleidsregels.id;


--
-- Name: goedkeuring_escalaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goedkeuring_escalaties (
    id integer NOT NULL,
    aanvraag_id integer NOT NULL,
    type text NOT NULL,
    naar_gebruiker_id integer,
    naar_gebruiker_naam text,
    bericht text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: goedkeuring_escalaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goedkeuring_escalaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goedkeuring_escalaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goedkeuring_escalaties_id_seq OWNED BY public.goedkeuring_escalaties.id;


--
-- Name: goedkeuring_stappen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goedkeuring_stappen (
    id integer NOT NULL,
    aanvraag_id integer NOT NULL,
    actie text NOT NULL,
    gebruiker_id integer,
    gebruiker_naam text,
    reden text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: goedkeuring_stappen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.goedkeuring_stappen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: goedkeuring_stappen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.goedkeuring_stappen_id_seq OWNED BY public.goedkeuring_stappen.id;


--
-- Name: governance_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_checks (
    id integer NOT NULL,
    gebruiker_id integer,
    gebruiker_naam text,
    rol text,
    methode text NOT NULL,
    route text NOT NULL,
    module text,
    entiteit text,
    risico_niveau text DEFAULT 'groen'::text NOT NULL,
    risico_score integer DEFAULT 0 NOT NULL,
    motivatie text,
    risico_factoren jsonb,
    afhandeling text DEFAULT 'automatisch'::text NOT NULL,
    geblokkeerd boolean DEFAULT false NOT NULL,
    statuscode integer,
    ip_adres text,
    user_agent text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: governance_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_checks_id_seq OWNED BY public.governance_checks.id;


--
-- Name: governance_wachtrij; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_wachtrij (
    id integer NOT NULL,
    check_id integer NOT NULL,
    vereist_rol text NOT NULL,
    aangevraagd_van_rol text,
    status text DEFAULT 'wacht'::text NOT NULL,
    goedgekeurd_door_id integer,
    goedgekeurd_door_naam text,
    opmerking text,
    afgehandeld_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: governance_wachtrij_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_wachtrij_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: governance_wachtrij_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_wachtrij_id_seq OWNED BY public.governance_wachtrij.id;


--
-- Name: helpdesk_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.helpdesk_tickets (
    id integer NOT NULL,
    gebruiker_id integer,
    naam text,
    email text,
    onderwerp text NOT NULL,
    bericht text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: helpdesk_tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.helpdesk_tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: helpdesk_tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.helpdesk_tickets_id_seq OWNED BY public.helpdesk_tickets.id;


--
-- Name: hrm_ai_voorstellen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrm_ai_voorstellen (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    document_id integer,
    medewerker_document_id integer,
    veld text NOT NULL,
    huidige_waarde text,
    voorgestelde_waarde text,
    reden text,
    brondocument text,
    paginanummer integer,
    confidence real,
    vertrouwen_score real,
    bewijskenmerken jsonb,
    impact text DEFAULT 'laag'::text,
    status text DEFAULT 'open'::text NOT NULL,
    beoordeeld_door_id integer,
    beoordeeld_op timestamp without time zone,
    model_gebruikt text,
    correctie_tekst text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: hrm_ai_voorstellen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hrm_ai_voorstellen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hrm_ai_voorstellen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hrm_ai_voorstellen_id_seq OWNED BY public.hrm_ai_voorstellen.id;


--
-- Name: hrm_middelen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrm_middelen (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    categorie text DEFAULT 'overig'::text NOT NULL,
    naam text NOT NULL,
    status text DEFAULT 'aangevraagd'::text NOT NULL,
    retour_vereist boolean DEFAULT false NOT NULL,
    gekoppeld_module text,
    aangevraagd_op timestamp without time zone,
    uitgegeven_op timestamp without time zone,
    ontvangst_bevestigd_op timestamp without time zone,
    opmerking text,
    aangevraagd_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: hrm_middelen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hrm_middelen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hrm_middelen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hrm_middelen_id_seq OWNED BY public.hrm_middelen.id;


--
-- Name: hrm_onboarding_taken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hrm_onboarding_taken (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    naam text NOT NULL,
    verantwoordelijke_id integer,
    deadline text,
    status text DEFAULT 'openstaand'::text NOT NULL,
    bewijs_document_id integer,
    opmerking text,
    herinnering_op timestamp without time zone,
    categorie text DEFAULT 'overig'::text,
    volgorde integer DEFAULT 0,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: hrm_onboarding_taken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hrm_onboarding_taken_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hrm_onboarding_taken_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hrm_onboarding_taken_id_seq OWNED BY public.hrm_onboarding_taken.id;


--
-- Name: import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_logs (
    id integer NOT NULL,
    type text NOT NULL,
    bestandsnaam text NOT NULL,
    rijen_totaal integer DEFAULT 0 NOT NULL,
    rijen_verwerkt integer DEFAULT 0 NOT NULL,
    rijen_overgeslagen integer DEFAULT 0 NOT NULL,
    fouten jsonb,
    gebruiker_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: import_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.import_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.import_logs_id_seq OWNED BY public.import_logs.id;


--
-- Name: inbox_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_audit_log (
    id integer NOT NULL,
    inbox_item_id integer NOT NULL,
    actie text NOT NULL,
    gebruiker_id integer,
    details text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inbox_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inbox_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inbox_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inbox_audit_log_id_seq OWNED BY public.inbox_audit_log.id;


--
-- Name: inbox_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_items (
    id integer NOT NULL,
    bestandsnaam text NOT NULL,
    bestandspad text NOT NULL,
    bestandsgrootte integer,
    mimetype text,
    geupload_door integer,
    geupload_op timestamp without time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'nieuw'::text NOT NULL,
    document_categorie text DEFAULT 'onbekend'::text,
    bestemming text DEFAULT 'Onbekend'::text,
    gekoppelde_entiteit_type text,
    gekoppelde_entiteit_id integer,
    gekoppelde_entiteit_naam text,
    ai_betrouwbaarheid text DEFAULT 'laag'::text,
    ai_samenvatting text,
    ai_redenering text,
    ai_metadata text,
    ai_volgende_actie text,
    duplicaat_van integer,
    mogelijk_duplicaat boolean DEFAULT false NOT NULL,
    goedgekeurd_door integer,
    goedgekeurd_op timestamp without time zone,
    afgewezen_reden text,
    verplaatst_op timestamp without time zone,
    opmerkingen text,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    snagstream_opdrachtgever text,
    snagstream_gebouw text,
    snagstream_project text,
    snagstream_rapportdatum text,
    snagstream_rapporttype text,
    snagstream_status text,
    ai_organisatie text,
    ai_jaar integer,
    ai_geconsolideerd boolean DEFAULT false NOT NULL,
    geconsolideerd_override boolean,
    ai_opslaglocatie text,
    ai_bewijs text,
    document_subtype text
);


--
-- Name: inbox_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inbox_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inbox_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inbox_items_id_seq OWNED BY public.inbox_items.id;


--
-- Name: inkoopbon_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inkoopbon_regels (
    id integer NOT NULL,
    inkoopbon_id integer NOT NULL,
    inkoopplan_regel_id integer,
    omschrijving text NOT NULL,
    hoeveelheid real DEFAULT 0 NOT NULL,
    eenheid text DEFAULT 'st'::text NOT NULL,
    prijs real,
    totaal real,
    volgorde integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inkoopbon_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inkoopbon_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inkoopbon_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inkoopbon_regels_id_seq OWNED BY public.inkoopbon_regels.id;


--
-- Name: inkoopbonnen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inkoopbonnen (
    id integer NOT NULL,
    inkoopplan_id integer,
    opdracht_id integer NOT NULL,
    bon_nummer text,
    leverancier text NOT NULL,
    leverancier_id integer,
    gewenste_leverdatum text,
    totaal_bedrag real,
    status text DEFAULT 'concept'::text NOT NULL,
    goedgekeurd_door_id integer,
    goedgekeurd_op timestamp without time zone,
    opmerkingen text,
    verzonden_op timestamp without time zone,
    verzonden_naar text,
    ai_suggestie boolean DEFAULT false NOT NULL,
    ai_motivatie text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inkoopbonnen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inkoopbonnen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inkoopbonnen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inkoopbonnen_id_seq OWNED BY public.inkoopbonnen.id;


--
-- Name: inkoopplan_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inkoopplan_regels (
    id integer NOT NULL,
    inkoopplan_id integer NOT NULL,
    werkbegroting_regel_id integer,
    omschrijving text NOT NULL,
    hoeveelheid real DEFAULT 0 NOT NULL,
    eenheid text DEFAULT 'st'::text NOT NULL,
    type text DEFAULT 'standaard'::text NOT NULL,
    leverancier text,
    aanbevolen_leverancier text,
    calc_prijs real,
    inkoopprijs_verwacht real,
    inkoopprijs real,
    besparing_per_eenheid real,
    besparing real,
    levertijd_weken integer,
    gewenste_leverdatum text,
    besteldatum text,
    status text DEFAULT 'open'::text NOT NULL,
    ai_motivatie text,
    opmerkingen text,
    bron text DEFAULT 'calculatie'::text NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    prijs_bron text DEFAULT 'onbekend'::text NOT NULL,
    prijs_geldig_tot text
);


--
-- Name: inkoopplan_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inkoopplan_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inkoopplan_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inkoopplan_regels_id_seq OWNED BY public.inkoopplan_regels.id;


--
-- Name: inkoopplannen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inkoopplannen (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    ai_gegenereerd boolean DEFAULT false NOT NULL,
    ai_gegenereerd_op timestamp without time zone,
    ai_samenvatting text,
    totale_besparing real,
    vastgesteld_op timestamp without time zone,
    vastgesteld_door_id integer,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    ai_adviezen jsonb,
    ai_adviezen_op timestamp without time zone
);


--
-- Name: inkoopplannen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inkoopplannen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inkoopplannen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inkoopplannen_id_seq OWNED BY public.inkoopplannen.id;


--
-- Name: inspectie_bevindingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspectie_bevindingen (
    id integer NOT NULL,
    inspectie_id integer NOT NULL,
    voorziening_id integer,
    status text DEFAULT 'goed'::text NOT NULL,
    omschrijving text,
    aanbeveling text,
    herstel_vereist boolean DEFAULT false NOT NULL,
    herstel_werkbon_id integer,
    foto_urls text DEFAULT '[]'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inspectie_bevindingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inspectie_bevindingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inspectie_bevindingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inspectie_bevindingen_id_seq OWNED BY public.inspectie_bevindingen.id;


--
-- Name: inspecties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inspecties (
    id integer NOT NULL,
    voorziening_id integer,
    gebouw_id integer,
    type text DEFAULT 'periodiek'::text NOT NULL,
    status text DEFAULT 'gepland'::text NOT NULL,
    inspecteur_id integer,
    geplande_datum text,
    uitgevoerd_datum text,
    bevindingen text,
    aanbevelingen text,
    goedgekeurd boolean,
    rapport_url text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inspecties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.inspecties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inspecties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.inspecties_id_seq OWNED BY public.inspecties.id;


--
-- Name: jaarafsluiting_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jaarafsluiting_regels (
    id integer NOT NULL,
    werkgever_id integer,
    jaar integer NOT NULL,
    verlofsoort_id integer,
    max_overdracht_uren real,
    overdracht_verval_datum text,
    uitgevoerd_op timestamp without time zone,
    uitgevoerd_door_id integer,
    opmerking text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: jaarafsluiting_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jaarafsluiting_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jaarafsluiting_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jaarafsluiting_regels_id_seq OWNED BY public.jaarafsluiting_regels.id;


--
-- Name: kantoor_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kantoor_releases (
    id integer NOT NULL,
    versienummer text NOT NULL,
    label text NOT NULL,
    samenvatting text,
    aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL,
    vrijgegeven_op timestamp with time zone,
    status text DEFAULT 'concept'::text NOT NULL,
    is_actief boolean DEFAULT false NOT NULL,
    commit_info text,
    db_versie text,
    build_geslaagd boolean,
    tests_geslaagd boolean,
    release_readiness_akkoord boolean,
    db_wijzigingen_gecontroleerd boolean,
    release_notes_aangemaakt boolean,
    geen_kritieke_fouten boolean,
    vrijgegeven_door integer,
    vrijgegeven_door_naam text,
    bekende_beperkingen_json text,
    vorige_versie_id integer
);


--
-- Name: kantoor_releases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kantoor_releases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kantoor_releases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kantoor_releases_id_seq OWNED BY public.kantoor_releases.id;


--
-- Name: label_applicaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.label_applicaties (
    id integer NOT NULL,
    label_id integer NOT NULL,
    type_code text NOT NULL
);


--
-- Name: label_applicaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.label_applicaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: label_applicaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.label_applicaties_id_seq OWNED BY public.label_applicaties.id;


--
-- Name: labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labels (
    id integer NOT NULL,
    type_code text,
    naam text NOT NULL,
    fabrikant text,
    fabrikant_id integer,
    testnorm text,
    testrapport_id integer,
    product_foto_url text,
    product_foto_bron text,
    product_foto_geverifieerd boolean DEFAULT false NOT NULL,
    product_foto_zekerheid text,
    product_foto_uitleg text,
    gearchiveerd boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: labels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.labels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: labels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.labels_id_seq OWNED BY public.labels.id;


--
-- Name: leesbevestigingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leesbevestigingen (
    id integer NOT NULL,
    bericht_id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    bevestigd_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: leesbevestigingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leesbevestigingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leesbevestigingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leesbevestigingen_id_seq OWNED BY public.leesbevestigingen.id;


--
-- Name: leverancier_categorisatie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leverancier_categorisatie (
    id integer NOT NULL,
    leverancier_id integer NOT NULL,
    grootboekrekening text,
    kostenplaats text,
    categorie text,
    btw_code text,
    aantal integer DEFAULT 1 NOT NULL,
    laatst_bevestigd_op timestamp without time zone DEFAULT now() NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: leverancier_categorisatie_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leverancier_categorisatie_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leverancier_categorisatie_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leverancier_categorisatie_id_seq OWNED BY public.leverancier_categorisatie.id;


--
-- Name: leverancier_prestaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leverancier_prestaties (
    id integer NOT NULL,
    leverancier_id integer NOT NULL,
    project_ref text,
    periode text,
    leverbetrouwbaarheid integer,
    levertijd_score integer,
    kwaliteit_score integer,
    garantieclaims integer DEFAULT 0,
    retourpercentage real,
    beschikbaarheid_score integer,
    communicatie_score integer,
    geschikt_spoed boolean,
    notities text,
    geregistreerd_door integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: leverancier_prestaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leverancier_prestaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leverancier_prestaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leverancier_prestaties_id_seq OWNED BY public.leverancier_prestaties.id;


--
-- Name: leveranciers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leveranciers (
    id integer NOT NULL,
    code text,
    naam text NOT NULL,
    adres text,
    huisnummer text,
    postcode text,
    stad text,
    provincie text,
    land text DEFAULT 'Nederland'::text NOT NULL,
    contactpersoon text,
    contact_functie text,
    contact_email text,
    contact_telefoon text,
    contact_mobiel text,
    email text,
    telefoon text,
    website text,
    kvk_nummer text,
    btw_nummer text,
    iban text,
    bic text,
    bank_naam text,
    t_nam_van text,
    betalingstermijn_dagen integer DEFAULT 30 NOT NULL,
    kortingspercentage integer,
    categorie text,
    productcategorieen text,
    grootboekrekening text,
    kostenplaats text,
    btw_code_default text,
    relatiecode text,
    g_rekening_van_toepassing boolean DEFAULT false NOT NULL,
    g_rekening_iban text,
    g_rekening_percentage real,
    notities text,
    actief boolean DEFAULT true NOT NULL,
    bron text DEFAULT 'handmatig'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    levertijd_dagen integer,
    leveringsgebied text,
    min_ordergrootte text,
    heeft_raamovereenkomst boolean DEFAULT false NOT NULL,
    geschikt_voor_spoed boolean DEFAULT false NOT NULL,
    prijsniveau text,
    certificeringen text[],
    kb_notities text,
    factuur_categorie text,
    auto_akkoord_drempel_cents integer
);


--
-- Name: leveranciers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leveranciers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leveranciers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leveranciers_id_seq OWNED BY public.leveranciers.id;


--
-- Name: login_pogingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_pogingen (
    id integer NOT NULL,
    gebruiker_id integer,
    email text NOT NULL,
    ip text,
    user_agent text,
    gelukt boolean DEFAULT false NOT NULL,
    nieuw_apparaat boolean DEFAULT false NOT NULL,
    nieuw_ip boolean DEFAULT false NOT NULL,
    tijdstip timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: login_pogingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_pogingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_pogingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_pogingen_id_seq OWNED BY public.login_pogingen.id;


--
-- Name: loon_output_bestanden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loon_output_bestanden (
    id integer NOT NULL,
    type text NOT NULL,
    werkmaatschappij text,
    werkgever_id integer,
    periode_jaar integer,
    periode_maand integer,
    medewerker_id integer,
    medewerker_naam text,
    bron text DEFAULT 'boekhouder'::text NOT NULL,
    bestandsnaam text NOT NULL,
    object_path text NOT NULL,
    bestandsgrootte integer,
    mime_type text,
    status text DEFAULT 'ontvangen'::text NOT NULL,
    zichtbaar_medewerker boolean DEFAULT false NOT NULL,
    gepubliceerd_op timestamp without time zone,
    gepubliceerd_door_id integer,
    upload_batch_ref text,
    notities text,
    uploader_id integer,
    uploader_naam text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: loon_output_bestanden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loon_output_bestanden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loon_output_bestanden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loon_output_bestanden_id_seq OWNED BY public.loon_output_bestanden.id;


--
-- Name: magazijn_inkooporder_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magazijn_inkooporder_regels (
    id integer NOT NULL,
    inkooporder_id integer NOT NULL,
    artikel_id integer NOT NULL,
    gevraagd_hoeveelheid real NOT NULL,
    ontvangen_hoeveelheid real DEFAULT 0 NOT NULL,
    eenheidsprijs real,
    btw_percentage integer DEFAULT 21 NOT NULL,
    omschrijving text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: magazijn_inkooporder_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.magazijn_inkooporder_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: magazijn_inkooporder_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.magazijn_inkooporder_regels_id_seq OWNED BY public.magazijn_inkooporder_regels.id;


--
-- Name: magazijn_inkooporders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magazijn_inkooporders (
    id integer NOT NULL,
    nummer text,
    status text DEFAULT 'concept'::text NOT NULL,
    leverancier_id integer,
    leverancier_naam text,
    leverancier_email text,
    verwachte_leverdatum timestamp without time zone,
    werkelijke_leverdatum timestamp without time zone,
    notities text,
    referentie text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    verstuurd_op timestamp without time zone,
    bevestigd_op timestamp without time zone,
    ontvangen_op timestamp without time zone
);


--
-- Name: magazijn_inkooporders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.magazijn_inkooporders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: magazijn_inkooporders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.magazijn_inkooporders_id_seq OWNED BY public.magazijn_inkooporders.id;


--
-- Name: magazijn_instellingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magazijn_instellingen (
    id integer DEFAULT 1 NOT NULL,
    signalering_uur integer DEFAULT 7 NOT NULL,
    signalering_minuut integer DEFAULT 0 NOT NULL,
    signalering_marge integer DEFAULT 0 NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_door_id integer
);


--
-- Name: magazijn_locaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magazijn_locaties (
    id integer NOT NULL,
    naam text NOT NULL,
    type text DEFAULT 'rek'::text NOT NULL,
    parent_id integer,
    omschrijving text,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: magazijn_locaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.magazijn_locaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: magazijn_locaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.magazijn_locaties_id_seq OWNED BY public.magazijn_locaties.id;


--
-- Name: magazijn_picklijst_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magazijn_picklijst_regels (
    id integer NOT NULL,
    picklijst_id integer NOT NULL,
    artikel_id integer NOT NULL,
    locatie_id integer,
    gevraagd_hoeveelheid real NOT NULL,
    gepickt_hoeveelheid real DEFAULT 0 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: magazijn_picklijst_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.magazijn_picklijst_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: magazijn_picklijst_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.magazijn_picklijst_regels_id_seq OWNED BY public.magazijn_picklijst_regels.id;


--
-- Name: magazijn_picklijsten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magazijn_picklijsten (
    id integer NOT NULL,
    opdracht_id integer,
    opdracht_titel text,
    status text DEFAULT 'concept'::text NOT NULL,
    geplande_uitgifte_op timestamp without time zone,
    notities text,
    aangemaakt_door_id integer,
    verwerkt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    verwerkt_op timestamp without time zone
);


--
-- Name: magazijn_picklijsten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.magazijn_picklijsten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: magazijn_picklijsten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.magazijn_picklijsten_id_seq OWNED BY public.magazijn_picklijsten.id;


--
-- Name: magazijn_snoozes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magazijn_snoozes (
    id integer NOT NULL,
    artikel_id integer NOT NULL,
    gesnoozed_tot timestamp without time zone NOT NULL,
    reden text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: magazijn_snoozes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.magazijn_snoozes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: magazijn_snoozes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.magazijn_snoozes_id_seq OWNED BY public.magazijn_snoozes.id;


--
-- Name: magazijn_stellingscans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magazijn_stellingscans (
    id integer NOT NULL,
    scan_type text DEFAULT 'voorraadcontrole'::text NOT NULL,
    foto_pad text NOT NULL,
    locatie_id integer,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'analyseren'::text NOT NULL,
    ai_suggesties jsonb,
    goedgekeurd_op timestamp without time zone,
    goedgekeurd_door_id integer,
    retour_project_id integer,
    retour_omschrijving text
);


--
-- Name: magazijn_stellingscans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.magazijn_stellingscans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: magazijn_stellingscans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.magazijn_stellingscans_id_seq OWNED BY public.magazijn_stellingscans.id;


--
-- Name: mail_logboek; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_logboek (
    id integer NOT NULL,
    naar_email text NOT NULL,
    naar_naam text,
    onderwerp text NOT NULL,
    soort text NOT NULL,
    status text NOT NULL,
    fout_categorie text,
    foutdetail text,
    verstuurd_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mail_logboek_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mail_logboek_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mail_logboek_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mail_logboek_id_seq OWNED BY public.mail_logboek.id;


--
-- Name: materiaal_aanvragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiaal_aanvragen (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    ingediend_door_id integer,
    reden text NOT NULL,
    omschrijving text,
    foto_pad text,
    status text DEFAULT 'nieuw'::text NOT NULL,
    ai_artikel_naam text,
    ai_leverancier text,
    ai_prijs_indicatie text,
    ai_scope_check text,
    ai_scope_toelichting text,
    ai_advies text,
    ai_logboek_json jsonb,
    behandeld_door_id integer,
    behandel_notitie text,
    aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: materiaal_aanvragen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.materiaal_aanvragen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: materiaal_aanvragen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.materiaal_aanvragen_id_seq OWNED BY public.materiaal_aanvragen.id;


--
-- Name: medewerker_aanstellingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medewerker_aanstellingen (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    werkmaatschappij text NOT NULL,
    werkgever_id integer,
    functie_id integer,
    cao text,
    contracturen_per_week real,
    is_hoofd boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: medewerker_aanstellingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medewerker_aanstellingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medewerker_aanstellingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medewerker_aanstellingen_id_seq OWNED BY public.medewerker_aanstellingen.id;


--
-- Name: medewerker_cao_keuzes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medewerker_cao_keuzes (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    type text NOT NULL,
    jaar integer,
    keuze text NOT NULL,
    fonds_naam text,
    bedrag_cents integer,
    toelichting text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: medewerker_cao_keuzes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medewerker_cao_keuzes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medewerker_cao_keuzes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medewerker_cao_keuzes_id_seq OWNED BY public.medewerker_cao_keuzes.id;


--
-- Name: medewerker_documenten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medewerker_documenten (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    type text DEFAULT 'overig'::text NOT NULL,
    label text,
    verloopdatum date,
    bestandsnaam text NOT NULL,
    object_path text NOT NULL,
    content_type text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: medewerker_documenten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medewerker_documenten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medewerker_documenten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medewerker_documenten_id_seq OWNED BY public.medewerker_documenten.id;


--
-- Name: medewerker_opleidingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medewerker_opleidingen (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    opleiding_id integer NOT NULL,
    status text DEFAULT 'behaald'::text NOT NULL,
    behaald_op text,
    verloopt_op text,
    certificaat_document_id integer,
    opmerking text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: medewerker_opleidingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medewerker_opleidingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medewerker_opleidingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medewerker_opleidingen_id_seq OWNED BY public.medewerker_opleidingen.id;


--
-- Name: medewerkers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medewerkers (
    id integer NOT NULL,
    gebruiker_id integer,
    naam text NOT NULL,
    email text,
    telefoon text,
    mobiel text,
    werkmaatschappij text DEFAULT 'FPS Brandpreventie'::text NOT NULL,
    werkgever_id integer,
    functie_id integer,
    cao text,
    dienstverband text DEFAULT 'vast'::text NOT NULL,
    bedrijf_uitzendbureau text,
    contracturen_per_week real,
    deeltijd_percentage real,
    in_dienst_sinds text,
    uit_dienst_per text,
    noodcontact_naam text,
    noodcontact_telefoon text,
    geboortedatum text,
    geboorteplaats text,
    adres text,
    postcode text,
    woonplaats text,
    rijbewijs text,
    rijbewijs_vervaldatum text,
    vca_vervaldatum text,
    ehbo_vervaldatum text,
    bhv_vervaldatum text,
    cv_tekst text,
    bsn text,
    actief boolean DEFAULT true NOT NULL,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    leidinggevende_id integer,
    verjaardag_zichtbaar boolean DEFAULT false NOT NULL,
    medewerker_status text DEFAULT 'concept'::text,
    wizard_voortgang jsonb,
    uitzendbureau_id integer
);


--
-- Name: medewerkers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medewerkers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medewerkers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medewerkers_id_seq OWNED BY public.medewerkers.id;


--
-- Name: mod_calc_adviezen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_adviezen (
    id integer NOT NULL,
    calculatie_id integer NOT NULL,
    run_id text NOT NULL,
    type text NOT NULL,
    prioriteit text DEFAULT 'middel'::text NOT NULL,
    titel text NOT NULL,
    uitleg text NOT NULL,
    status text DEFAULT 'actief'::text NOT NULL,
    notitie text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_adviezen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_adviezen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_adviezen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_adviezen_id_seq OWNED BY public.mod_calc_adviezen.id;


--
-- Name: mod_calc_artikelen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_artikelen (
    id integer NOT NULL,
    leverancier_id integer,
    artikelcode text,
    omschrijving text NOT NULL,
    eenheid text DEFAULT 'st'::text NOT NULL,
    inkoopprijs real DEFAULT 0 NOT NULL,
    verkoopprijs real DEFAULT 0 NOT NULL,
    categorie text DEFAULT 'materiaal'::text NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_artikelen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_artikelen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_artikelen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_artikelen_id_seq OWNED BY public.mod_calc_artikelen.id;


--
-- Name: mod_calc_bronbestanden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_bronbestanden (
    id integer NOT NULL,
    bestandsnaam text NOT NULL,
    bestandsgrootte integer DEFAULT 0 NOT NULL,
    sha256 text NOT NULL,
    mime text DEFAULT 'application/pdf'::text NOT NULL,
    object_path text NOT NULL,
    bron_type text DEFAULT 'enk_pdf'::text NOT NULL,
    calculatienummer text,
    projectnummer text,
    opdrachtgever text,
    status text DEFAULT 'geanalyseerd'::text NOT NULL,
    parse_resultaat jsonb,
    gekozen_verwerking text,
    totaal_keuze text,
    calculatie_id integer,
    uploader_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_bronbestanden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_bronbestanden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_bronbestanden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_bronbestanden_id_seq OWNED BY public.mod_calc_bronbestanden.id;


--
-- Name: mod_calc_eenheden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_eenheden (
    id integer NOT NULL,
    calculatie_id integer NOT NULL,
    naam text NOT NULL,
    type text DEFAULT 'vrije_projecteenheid'::text NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_eenheden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_eenheden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_eenheden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_eenheden_id_seq OWNED BY public.mod_calc_eenheden.id;


--
-- Name: mod_calc_headers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_headers (
    id integer NOT NULL,
    naam text NOT NULL,
    referentie text,
    klant_naam text,
    gebouw_id integer,
    opname_id integer,
    project_naam text,
    werknummer text,
    status text DEFAULT 'concept'::text NOT NULL,
    omschrijving text,
    opmerkingen text,
    opslag_materiaal real DEFAULT 0 NOT NULL,
    opslag_arbeid real DEFAULT 0 NOT NULL,
    opslag_ak real DEFAULT 15 NOT NULL,
    opslag_abk real DEFAULT 10 NOT NULL,
    opslag_risico real DEFAULT 5 NOT NULL,
    opslag_winst real DEFAULT 10 NOT NULL,
    korting real DEFAULT 0 NOT NULL,
    ak_is_vast boolean DEFAULT false NOT NULL,
    abk_is_vast boolean DEFAULT false NOT NULL,
    risico_is_vast boolean DEFAULT false NOT NULL,
    winst_is_vast boolean DEFAULT false NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_headers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_headers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_headers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_headers_id_seq OWNED BY public.mod_calc_headers.id;


--
-- Name: mod_calc_inkoop_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_inkoop_items (
    id integer NOT NULL,
    calculatie_id integer NOT NULL,
    regel_id integer,
    type text DEFAULT 'materiaal'::text NOT NULL,
    omschrijving text NOT NULL,
    artikel text,
    leverancier text,
    leverancier_id integer,
    leverancier_email text,
    gekozen_leverancier text,
    aantal real DEFAULT 1,
    eenheid text DEFAULT 'st'::text,
    prijs real,
    offerte_ontvangen boolean DEFAULT false NOT NULL,
    levertijd text,
    reactiedatum text,
    beslisdatum text,
    leverdatum text,
    toelichting text,
    concept_mail text,
    herinnering_verstuurd boolean DEFAULT false NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    datum_verstuurd text,
    datum_ontvangen text,
    bedrag real,
    notities text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_inkoop_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_inkoop_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_inkoop_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_inkoop_items_id_seq OWNED BY public.mod_calc_inkoop_items.id;


--
-- Name: mod_calc_leveranciers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_leveranciers (
    id integer NOT NULL,
    naam text NOT NULL,
    contactpersoon text,
    email text,
    telefoon text,
    website text,
    notities text,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_leveranciers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_leveranciers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_leveranciers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_leveranciers_id_seq OWNED BY public.mod_calc_leveranciers.id;


--
-- Name: mod_calc_normtijden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_normtijden (
    id integer NOT NULL,
    code text NOT NULL,
    omschrijving text NOT NULL,
    categorie text DEFAULT 'brandwerende afdichting'::text NOT NULL,
    eenheid text DEFAULT 'st'::text NOT NULL,
    uren_per_eenheid real DEFAULT 0 NOT NULL,
    actief boolean DEFAULT true NOT NULL
);


--
-- Name: mod_calc_normtijden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_normtijden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_normtijden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_normtijden_id_seq OWNED BY public.mod_calc_normtijden.id;


--
-- Name: mod_calc_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_regels (
    id integer NOT NULL,
    calculatie_id integer NOT NULL,
    eenheid_id integer,
    categorie text DEFAULT 'arbeid'::text NOT NULL,
    omschrijving text NOT NULL,
    normtijd_id integer,
    artikel_id integer,
    eenheid text DEFAULT 'st'::text NOT NULL,
    hoeveelheid real DEFAULT 0 NOT NULL,
    tarief real DEFAULT 0 NOT NULL,
    totaal real DEFAULT 0 NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    opmerkingen text,
    regelnummer text,
    mu_per_eenheid real DEFAULT 0 NOT NULL,
    arbeids_tarief real DEFAULT 0 NOT NULL,
    onderaanneming_bedrag real DEFAULT 0 NOT NULL,
    is_staartkosten boolean DEFAULT false NOT NULL,
    is_bouwplaatskosten boolean DEFAULT false NOT NULL,
    hoofdstuk text DEFAULT 'Overige werkzaamheden'::text NOT NULL,
    klanttekst text,
    btw_tarief text DEFAULT '21'::text NOT NULL,
    wand_plafond text,
    toepassing_tekst text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_regels_id_seq OWNED BY public.mod_calc_regels.id;


--
-- Name: mod_calc_tarieven; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_tarieven (
    id integer NOT NULL,
    naam text NOT NULL,
    tarief real DEFAULT 0 NOT NULL,
    eenheid text DEFAULT 'uur'::text NOT NULL,
    categorie text DEFAULT 'arbeid'::text NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mod_calc_tarieven_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_tarieven_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_tarieven_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_tarieven_id_seq OWNED BY public.mod_calc_tarieven.id;


--
-- Name: mod_calc_versies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_calc_versies (
    id integer NOT NULL,
    calculatie_id integer NOT NULL,
    versienummer integer DEFAULT 1 NOT NULL,
    label text,
    snapshot jsonb NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    aangemaakt_door_id integer
);


--
-- Name: mod_calc_versies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_calc_versies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_calc_versies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_calc_versies_id_seq OWNED BY public.mod_calc_versies.id;


--
-- Name: module_beoordelingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_beoordelingen (
    id integer NOT NULL,
    module_sleutel text NOT NULL,
    status text NOT NULL,
    opmerking text,
    beoordeeld_door_id integer,
    beoordeeld_door_naam text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: module_beoordelingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.module_beoordelingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: module_beoordelingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.module_beoordelingen_id_seq OWNED BY public.module_beoordelingen.id;


--
-- Name: monteur_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monteur_achievements (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    medewerker_id integer,
    spots_mijlpaal integer NOT NULL,
    rang text NOT NULL,
    beloning text NOT NULL,
    behaald_op date NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: monteur_achievements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.monteur_achievements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: monteur_achievements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.monteur_achievements_id_seq OWNED BY public.monteur_achievements.id;


--
-- Name: muis_gebeurtenissen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.muis_gebeurtenissen (
    id integer NOT NULL,
    gebruiker_id integer,
    pagina text NOT NULL,
    type text NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    tijdstip timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: muis_gebeurtenissen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.muis_gebeurtenissen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: muis_gebeurtenissen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.muis_gebeurtenissen_id_seq OWNED BY public.muis_gebeurtenissen.id;


--
-- Name: object_rechten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.object_rechten (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    object_type text NOT NULL,
    object_id integer NOT NULL,
    module_id text,
    niveau integer DEFAULT 0 NOT NULL,
    geldig_van timestamp without time zone,
    geldig_tot timestamp without time zone,
    verleend_door integer,
    werkmaatschappij_id integer,
    reden text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: object_rechten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.object_rechten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: object_rechten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.object_rechten_id_seq OWNED BY public.object_rechten.id;


--
-- Name: offerte_bijlagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_bijlagen (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    bijlage_type text DEFAULT 'overig'::text NOT NULL,
    naam text DEFAULT ''::text NOT NULL,
    beschrijving text,
    url text,
    volgorde integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_bijlagen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_bijlagen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_bijlagen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_bijlagen_id_seq OWNED BY public.offerte_bijlagen.id;


--
-- Name: offerte_contract_adviezen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_contract_adviezen (
    id integer NOT NULL,
    contract_id integer NOT NULL,
    risico_niveau text DEFAULT 'middel'::text NOT NULL,
    aandachtspunten jsonb DEFAULT '[]'::jsonb NOT NULL,
    advies_samenvatting text,
    volledig_advies text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bevestigd_door_id integer,
    bevestigd_op timestamp without time zone
);


--
-- Name: offerte_contract_adviezen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_contract_adviezen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_contract_adviezen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_contract_adviezen_id_seq OWNED BY public.offerte_contract_adviezen.id;


--
-- Name: offerte_email_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_email_log (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    ontvanger text NOT NULL,
    onderwerp text NOT NULL,
    status text DEFAULT 'verzonden'::text NOT NULL,
    portaal_token text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_email_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_email_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_email_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_email_log_id_seq OWNED BY public.offerte_email_log.id;


--
-- Name: offerte_handtekeningen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_handtekeningen (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    naam text NOT NULL,
    bedrijf text,
    functie text,
    datum text NOT NULL,
    ip text,
    handtekening_data_url text NOT NULL,
    versienummer integer DEFAULT 1 NOT NULL,
    portaal_token text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_handtekeningen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_handtekeningen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_handtekeningen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_handtekeningen_id_seq OWNED BY public.offerte_handtekeningen.id;


--
-- Name: offerte_hoofdstukken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_hoofdstukken (
    id integer NOT NULL,
    sjabloon_id integer NOT NULL,
    titel text NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    type text DEFAULT 'variabel'::text NOT NULL,
    standaardtekst text,
    ai_veld boolean DEFAULT false NOT NULL,
    ai_hint text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_hoofdstukken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_hoofdstukken_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_hoofdstukken_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_hoofdstukken_id_seq OWNED BY public.offerte_hoofdstukken.id;


--
-- Name: offerte_klant_contracten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_klant_contracten (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    bestandsnaam text NOT NULL,
    bestand_pad text NOT NULL,
    mime_type text DEFAULT 'application/pdf'::text NOT NULL,
    extracted_text text,
    geupload_door_id integer,
    geupload_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_klant_contracten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_klant_contracten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_klant_contracten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_klant_contracten_id_seq OWNED BY public.offerte_klant_contracten.id;


--
-- Name: offerte_portaal_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_portaal_tokens (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    token text NOT NULL,
    verloopt_op timestamp without time zone NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_portaal_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_portaal_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_portaal_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_portaal_tokens_id_seq OWNED BY public.offerte_portaal_tokens.id;


--
-- Name: offerte_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_regels (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    categorie text DEFAULT 'maatregel'::text NOT NULL,
    snag_referentie text,
    voorziening_id integer,
    maatregel text NOT NULL,
    ruimte text,
    uitgangspunten text,
    eenheid text DEFAULT 'st'::text NOT NULL,
    aantal real DEFAULT 0 NOT NULL,
    prijs_per_eenheid real DEFAULT 0 NOT NULL,
    kosten real DEFAULT 0 NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    ai_voorstel boolean DEFAULT false NOT NULL,
    is_optioneel boolean DEFAULT false NOT NULL,
    optioneel_geselecteerd boolean DEFAULT true NOT NULL,
    weergave_override text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_regels_id_seq OWNED BY public.offerte_regels.id;


--
-- Name: offerte_secties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_secties (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    sectie_type text DEFAULT 'vrij'::text NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    titel text DEFAULT ''::text NOT NULL,
    inhoud text,
    ai_gegenereerd boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    fotos jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: offerte_secties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_secties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_secties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_secties_id_seq OWNED BY public.offerte_secties.id;


--
-- Name: offerte_sjablonen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_sjablonen (
    id integer NOT NULL,
    naam text NOT NULL,
    omschrijving text,
    werkmaatschappij text DEFAULT 'FPS Bouw'::text NOT NULL,
    doelgroep text DEFAULT 'algemeen'::text NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_sjablonen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_sjablonen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_sjablonen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_sjablonen_id_seq OWNED BY public.offerte_sjablonen.id;


--
-- Name: offerte_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_tracking (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    event text NOT NULL,
    portaal_token text,
    ip text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_tracking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_tracking_id_seq OWNED BY public.offerte_tracking.id;


--
-- Name: offerte_uitgangspunten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_uitgangspunten (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    snag_referentie text,
    voorziening_id integer,
    type text DEFAULT 'uitgangspunt'::text NOT NULL,
    tekst text NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    ai_voorstel boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_uitgangspunten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_uitgangspunten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_uitgangspunten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_uitgangspunten_id_seq OWNED BY public.offerte_uitgangspunten.id;


--
-- Name: offerte_versies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_versies (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    versienummer integer DEFAULT 1 NOT NULL,
    snapshot jsonb,
    samenvatting text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_versies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_versies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_versies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_versies_id_seq OWNED BY public.offerte_versies.id;


--
-- Name: offerte_voorwaarden_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_voorwaarden_sets (
    id integer NOT NULL,
    naam text NOT NULL,
    versie text DEFAULT '1.0'::text NOT NULL,
    tekst text DEFAULT ''::text NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_voorwaarden_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_voorwaarden_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_voorwaarden_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_voorwaarden_sets_id_seq OWNED BY public.offerte_voorwaarden_sets.id;


--
-- Name: offerte_vragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offerte_vragen (
    id integer NOT NULL,
    offerte_id integer NOT NULL,
    bezoeker_naam text,
    bezoeker_email text,
    vraag text NOT NULL,
    type text,
    antwoord text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: offerte_vragen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offerte_vragen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offerte_vragen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offerte_vragen_id_seq OWNED BY public.offerte_vragen.id;


--
-- Name: offertes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offertes (
    id integer NOT NULL,
    offertenummer text,
    titel text NOT NULL,
    gebouw_id integer,
    klant_id integer,
    sjabloon_id integer,
    opdrachtgever text,
    ons_kenmerk text,
    uw_kenmerk text,
    uw_brief_van text,
    behandeld_door_id integer,
    datum text,
    geldigheid_dagen integer DEFAULT 30 NOT NULL,
    voorwaarden text,
    bedrag_excl_btw real DEFAULT 0 NOT NULL,
    btw_percentage real DEFAULT 21 NOT NULL,
    bedrag_incl_btw real DEFAULT 0 NOT NULL,
    kleurthema text DEFAULT 'fps-oranje'::text,
    calculatie_id integer,
    betalingstermijn_dagen integer DEFAULT 30 NOT NULL,
    betaalwijze text,
    factuur_schema jsonb,
    begroting_weergave jsonb,
    voorwaarden_set_id integer,
    voorwaarden_snapshot text,
    presentatie_niveau integer DEFAULT 3,
    klant_type text,
    vervolg_opties jsonb,
    vervolg_tekst text,
    status text DEFAULT 'concept'::text NOT NULL,
    portaal_status text DEFAULT 'concept'::text NOT NULL,
    verzend_type text DEFAULT 'ondertekening'::text NOT NULL,
    auto_project_id integer,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    studio_model_id integer,
    projectkans_id integer
);


--
-- Name: offertes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.offertes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: offertes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.offertes_id_seq OWNED BY public.offertes.id;


--
-- Name: onderaannemer_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onderaannemer_orders (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    omschrijving text NOT NULL,
    bedrijf text,
    contactpersoon text,
    werkzaamheden text,
    bedrag_excl_btw real,
    btw_percentage real DEFAULT 21 NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    gewenste_startdatum text,
    gewenste_einddatum text,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: onderaannemer_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.onderaannemer_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: onderaannemer_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.onderaannemer_orders_id_seq OWNED BY public.onderaannemer_orders.id;


--
-- Name: onderhanden_werk_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onderhanden_werk_overrides (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    waarderingsmethode text DEFAULT 'percentage_gereed'::text NOT NULL,
    percentage_gereed real,
    handmatig_bedrag numeric(12,2),
    opmerkingen text,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_door_id integer
);


--
-- Name: onderhanden_werk_overrides_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.onderhanden_werk_overrides_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: onderhanden_werk_overrides_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.onderhanden_werk_overrides_id_seq OWNED BY public.onderhanden_werk_overrides.id;


--
-- Name: onderhoud; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onderhoud (
    id integer NOT NULL,
    voorziening_id integer,
    gebouw_id integer,
    titel text NOT NULL,
    omschrijving text,
    prioriteit text DEFAULT 'normaal'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    toegewezen_aan_id integer,
    deadline text,
    voltooid_datum text,
    resultaat text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: onderhoud_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.onderhoud_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: onderhoud_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.onderhoud_id_seq OWNED BY public.onderhoud.id;


--
-- Name: onderhoudscontracten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onderhoudscontracten (
    id integer NOT NULL,
    contractnummer text NOT NULL,
    gebouw_id integer,
    opdrachtgever text,
    contactpersoon_naam text,
    contactpersoon_email text,
    contactpersoon_telefoon text,
    contracttype text DEFAULT 'preventief'::text NOT NULL,
    ingangsdatum text,
    einddatum text,
    looptijd_maanden integer,
    automatische_verlenging boolean DEFAULT false NOT NULL,
    opzegtermijn_maanden integer,
    indexering text DEFAULT 'geen'::text NOT NULL,
    indexering_percentage numeric(5,2),
    contractwaarde numeric(12,2),
    facturatie_frequentie text DEFAULT 'jaarlijks_vooraf'::text NOT NULL,
    onderhouds_frequentie text DEFAULT 'jaarlijks'::text NOT NULL,
    eerstvolgende_onderhoud text,
    laatste_onderhoud text,
    status text DEFAULT 'concept'::text NOT NULL,
    notities text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: onderhoudscontracten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.onderhoudscontracten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: onderhoudscontracten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.onderhoudscontracten_id_seq OWNED BY public.onderhoudscontracten.id;


--
-- Name: opdrachten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opdrachten (
    id integer NOT NULL,
    offerte_id integer,
    calculatie_id integer,
    gebouw_id integer,
    project_id integer,
    titel text NOT NULL,
    werknummer text,
    opdrachtgever text,
    omschrijving text,
    type text DEFAULT 'vast'::text NOT NULL,
    budget_uren real,
    status text DEFAULT 'actief'::text NOT NULL,
    ai_fase text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: opdrachten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opdrachten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opdrachten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opdrachten_id_seq OWNED BY public.opdrachten.id;


--
-- Name: opdrachtgever_voorkeuren; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opdrachtgever_voorkeuren (
    id integer NOT NULL,
    klant_id integer NOT NULL,
    verplichte_artikel_ids integer[],
    verboden_artikel_ids integer[],
    rapportage_eisen text,
    documentvereisten text,
    uitvoeringsdetails text,
    keuringsvoorschriften text,
    onderhoudsafspraken text,
    kb_notities text,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: opdrachtgever_voorkeuren_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opdrachtgever_voorkeuren_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opdrachtgever_voorkeuren_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opdrachtgever_voorkeuren_id_seq OWNED BY public.opdrachtgever_voorkeuren.id;


--
-- Name: opleidingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opleidingen (
    id integer NOT NULL,
    naam text NOT NULL,
    categorie text DEFAULT 'overig'::text NOT NULL,
    soort text DEFAULT 'cursus'::text NOT NULL,
    omschrijving text,
    niveau text,
    opleider text,
    studieduur text,
    studiebelasting text,
    lesvorm text,
    kosten_indicatie text,
    kosten_werkgever_pct integer,
    kosten_werknemer_pct integer,
    geldigheid_maanden integer,
    verplicht boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: opleidingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opleidingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opleidingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opleidingen_id_seq OWNED BY public.opleidingen.id;


--
-- Name: opleverrapporten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opleverrapporten (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    rapport_type text DEFAULT 'opleverrapport'::text NOT NULL,
    versie integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    titel text,
    secties jsonb DEFAULT '{}'::jsonb NOT NULL,
    spot_selectie jsonb DEFAULT '{}'::jsonb NOT NULL,
    bijlagen_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    tekening_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    bevroren_op timestamp without time zone,
    bevroren_document_revisies jsonb,
    reactietermijn_datum timestamp without time zone,
    reactietermijn_gestart_op timestamp without time zone,
    certificaat_geaccordeerd boolean DEFAULT false NOT NULL,
    certificaat_geaccordeerd_op timestamp without time zone,
    certificaat_garantie_maanden integer DEFAULT 12 NOT NULL,
    aangemaakt_door integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    werkbon_id integer,
    vervangen_door_rapport_id integer,
    vervangen_op timestamp without time zone,
    reactietermijn_melding_verzond_op timestamp without time zone,
    vervangen_door_id integer,
    klant_reactie_op timestamp without time zone,
    klant_reactie_type text
);


--
-- Name: opleverrapporten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opleverrapporten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opleverrapporten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opleverrapporten_id_seq OWNED BY public.opleverrapporten.id;


--
-- Name: opname_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opname_fotos (
    id integer NOT NULL,
    item_id integer NOT NULL,
    object_path text NOT NULL,
    bijschrift text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: opname_fotos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opname_fotos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opname_fotos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opname_fotos_id_seq OWNED BY public.opname_fotos.id;


--
-- Name: opname_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opname_items (
    id integer NOT NULL,
    opname_id integer NOT NULL,
    spot_type text NOT NULL,
    ruimte text,
    verdieping_id integer,
    beschrijving text,
    actie text DEFAULT 'controleren'::text NOT NULL,
    bereikbaarheid text DEFAULT 'goed'::text NOT NULL,
    aantal integer DEFAULT 1 NOT NULL,
    afmetingen text,
    prioriteit text DEFAULT 'normaal'::text NOT NULL,
    notities text,
    afgerond boolean DEFAULT false NOT NULL,
    tekening_x integer,
    tekening_y integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: opname_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opname_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opname_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opname_items_id_seq OWNED BY public.opname_items.id;


--
-- Name: opnames; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opnames (
    id integer NOT NULL,
    gebouw_id integer,
    naam text NOT NULL,
    datum text NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    notities text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: opnames_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opnames_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: opnames_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opnames_id_seq OWNED BY public.opnames.id;


--
-- Name: org_bedrijfsdocumenten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_bedrijfsdocumenten (
    id integer NOT NULL,
    naam text NOT NULL,
    categorie text NOT NULL,
    omschrijving text,
    uitgever text,
    referentie text,
    ingangsdatum text,
    vervaldatum text,
    status text DEFAULT 'actief'::text NOT NULL,
    document_id integer,
    opmerkingen text,
    bestand_hash text,
    bestand_pad text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: org_bedrijfsdocumenten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_bedrijfsdocumenten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_bedrijfsdocumenten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_bedrijfsdocumenten_id_seq OWNED BY public.org_bedrijfsdocumenten.id;


--
-- Name: org_jaarverslagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_jaarverslagen (
    id integer NOT NULL,
    boekjaar integer NOT NULL,
    type text NOT NULL,
    omschrijving text,
    accountant text,
    definitief boolean DEFAULT false NOT NULL,
    vastgesteld_op text,
    document_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: org_jaarverslagen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_jaarverslagen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_jaarverslagen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_jaarverslagen_id_seq OWNED BY public.org_jaarverslagen.id;


--
-- Name: org_verzekeringen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_verzekeringen (
    id integer NOT NULL,
    type text NOT NULL,
    omschrijving text,
    maatschappij text,
    polisnummer text,
    premie numeric(12,2),
    premie_frequentie text DEFAULT 'jaarlijks'::text,
    ingangsdatum text,
    vervaldatum text,
    eigen_risico numeric(12,2),
    status text DEFAULT 'actief'::text NOT NULL,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: org_verzekeringen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_verzekeringen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_verzekeringen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_verzekeringen_id_seq OWNED BY public.org_verzekeringen.id;


--
-- Name: pbm_inspecties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pbm_inspecties (
    id integer NOT NULL,
    pbm_item_id integer NOT NULL,
    medewerker_id integer,
    datum text NOT NULL,
    foto_paden jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_beoordeling text,
    ai_aanbeveling text,
    ai_slijtage text DEFAULT 'onbekend'::text NOT NULL,
    ai_keur_nodig boolean DEFAULT false NOT NULL,
    formele_status text DEFAULT 'in_behandeling'::text NOT NULL,
    beoordeeld_door_id integer,
    beoordeeld_door_naam text,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pbm_inspecties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pbm_inspecties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pbm_inspecties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pbm_inspecties_id_seq OWNED BY public.pbm_inspecties.id;


--
-- Name: pbm_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pbm_items (
    id integer NOT NULL,
    medewerker_id integer,
    medewerker_naam text,
    type text NOT NULL,
    merk text,
    model text,
    maat text,
    serienummer text,
    uitgifte_datum text,
    vervangings_datum text,
    garantietermijn text,
    fabrikant text,
    handleiding_pad text,
    keurings_interval_maanden integer,
    laatste_controle text,
    status text DEFAULT 'actief'::text NOT NULL,
    foto_paden jsonb DEFAULT '[]'::jsonb NOT NULL,
    opmerkingen text,
    qr_code text,
    uitgeleend_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pbm_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pbm_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pbm_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pbm_items_id_seq OWNED BY public.pbm_items.id;


--
-- Name: pim_foto_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pim_foto_analyses (
    id integer NOT NULL,
    stap_id integer NOT NULL,
    foto_object_path text,
    status text DEFAULT 'wachtend'::text NOT NULL,
    afwijkingsstatus text,
    annotatie_object_path text,
    ai_beoordeling text,
    ai_aandachtspunten text[],
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pim_foto_analyses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pim_foto_analyses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pim_foto_analyses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pim_foto_analyses_id_seq OWNED BY public.pim_foto_analyses.id;


--
-- Name: pim_modellen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pim_modellen (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    aanvraag_via_one boolean DEFAULT false NOT NULL,
    aanvraag_context jsonb,
    advies_context jsonb,
    werkvoorbereiding_context jsonb,
    inkoop_context jsonb,
    uitvoerings_log jsonb,
    oplevering_context jsonb,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pim_modellen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pim_modellen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pim_modellen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pim_modellen_id_seq OWNED BY public.pim_modellen.id;


--
-- Name: pim_uitvoering_stappen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pim_uitvoering_stappen (
    id integer NOT NULL,
    pim_id integer NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    werkpakket_sleutel text,
    instructie_json jsonb,
    antwoorden_json jsonb,
    foto_urls text[],
    ai_analyse_json jsonb,
    afwijking_json jsonb,
    voorziening_ids integer[],
    voltooid_door_id integer,
    voltooid_op timestamp without time zone,
    guidance_context jsonb,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pim_uitvoering_stappen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pim_uitvoering_stappen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pim_uitvoering_stappen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pim_uitvoering_stappen_id_seq OWNED BY public.pim_uitvoering_stappen.id;


--
-- Name: planning_afwezigheid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planning_afwezigheid (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    type text DEFAULT 'vakantie'::text NOT NULL,
    datum_start text NOT NULL,
    datum_eind text NOT NULL,
    omschrijving text,
    status text DEFAULT 'aangevraagd'::text NOT NULL,
    goedgekeurd_door_id integer,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: planning_afwezigheid_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.planning_afwezigheid_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: planning_afwezigheid_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.planning_afwezigheid_id_seq OWNED BY public.planning_afwezigheid.id;


--
-- Name: planning_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planning_items (
    id integer NOT NULL,
    titel text NOT NULL,
    omschrijving text,
    medewerker_id integer,
    gebouw_id integer,
    project_id integer,
    opdracht_id integer,
    project_naam text,
    datum_start text NOT NULL,
    datum_eind text NOT NULL,
    tijd_start text,
    tijd_eind text,
    uren real DEFAULT 8 NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    type text DEFAULT 'intern'::text NOT NULL,
    opdracht_type text,
    locaties text,
    werknummer text,
    tijdsloten text,
    dag_notities text,
    notities text,
    uitvoering_status text DEFAULT 'gepland'::text NOT NULL,
    op_gesloten_dag boolean DEFAULT false NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: planning_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.planning_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: planning_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.planning_items_id_seq OWNED BY public.planning_items.id;


--
-- Name: planning_meerwerk; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planning_meerwerk (
    id integer NOT NULL,
    planning_item_id integer NOT NULL,
    meerwerk_nummer text,
    omschrijving text,
    status text DEFAULT 'concept'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: planning_meerwerk_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.planning_meerwerk_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: planning_meerwerk_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.planning_meerwerk_id_seq OWNED BY public.planning_meerwerk.id;


--
-- Name: poortwachter_dossiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.poortwachter_dossiers (
    id integer NOT NULL,
    ziekmelding_id integer NOT NULL,
    medewerker_id integer NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: poortwachter_dossiers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.poortwachter_dossiers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: poortwachter_dossiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.poortwachter_dossiers_id_seq OWNED BY public.poortwachter_dossiers.id;


--
-- Name: poortwachter_mijlpalen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.poortwachter_mijlpalen (
    id integer NOT NULL,
    dossier_id integer NOT NULL,
    type text NOT NULL,
    deadline_datum text NOT NULL,
    afgerond_op timestamp without time zone,
    notitie text,
    bijgewerkt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: poortwachter_mijlpalen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.poortwachter_mijlpalen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: poortwachter_mijlpalen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.poortwachter_mijlpalen_id_seq OWNED BY public.poortwachter_mijlpalen.id;


--
-- Name: profielen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profielen (
    id integer NOT NULL,
    naam text NOT NULL,
    bevoegdheden jsonb DEFAULT '{}'::jsonb NOT NULL,
    systeem boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    groep text
);


--
-- Name: profielen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profielen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profielen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profielen_id_seq OWNED BY public.profielen.id;


--
-- Name: project_begrotingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_begrotingen (
    id integer NOT NULL,
    project_id integer,
    gebouw_id integer,
    opdracht_id integer,
    calculatie_id integer,
    werknummer text,
    hoofd_uren_begroot real DEFAULT 0 NOT NULL,
    meerwerk_uren_begroot real DEFAULT 0 NOT NULL,
    totaal_arbeid_uren real DEFAULT 0 NOT NULL,
    totaal_materiaal_bedrag real DEFAULT 0 NOT NULL,
    omschrijving text,
    status text DEFAULT 'concept'::text NOT NULL,
    vastgesteld_door_id integer,
    vastgesteld_op timestamp without time zone,
    ai_analyse jsonb,
    ai_analyse_op timestamp without time zone,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: project_begrotingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.project_begrotingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: project_begrotingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.project_begrotingen_id_seq OWNED BY public.project_begrotingen.id;


--
-- Name: projecten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projecten (
    id integer NOT NULL,
    naam text NOT NULL,
    werknummer text,
    status text DEFAULT 'concept'::text NOT NULL,
    werkmaatschappij text,
    omschrijving text,
    crm_klant_id integer,
    gebouw_id integer,
    start_datum text,
    eind_datum text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: projecten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projecten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projecten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projecten_id_seq OWNED BY public.projecten.id;


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    expo_push_token text NOT NULL,
    platform text DEFAULT 'onbekend'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    laatst_gebruikt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: push_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_tokens_id_seq OWNED BY public.push_tokens.id;


--
-- Name: regie_begroting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regie_begroting (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    verwacht_uren real,
    verwacht_materiaal real,
    verwacht_materieel real,
    verwacht_doorlooptijd_dagen integer,
    maximaal_budget real,
    meldgrens_opdrachtgever real,
    ai_signalering_actief boolean DEFAULT true NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: regie_begroting_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regie_begroting_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regie_begroting_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regie_begroting_id_seq OWNED BY public.regie_begroting.id;


--
-- Name: regie_materialen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regie_materialen (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    datum text NOT NULL,
    artikel text NOT NULL,
    omschrijving text,
    hoeveelheid real DEFAULT 1 NOT NULL,
    eenheid text DEFAULT 'st'::text NOT NULL,
    inkoopprijs real,
    verkoopprijs real,
    bron text DEFAULT 'magazijn'::text NOT NULL,
    leverancier text,
    bonnummer text,
    foto_pad text,
    status text DEFAULT 'concept'::text NOT NULL,
    geboekt_door_id integer,
    geboekt_door_medewerker_id integer,
    opmerking text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: regie_materialen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regie_materialen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regie_materialen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regie_materialen_id_seq OWNED BY public.regie_materialen.id;


--
-- Name: regie_tarieven; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regie_tarieven (
    id integer NOT NULL,
    voorwaarden_id integer NOT NULL,
    functiegroep text NOT NULL,
    uurtarief real NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: regie_tarieven_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regie_tarieven_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regie_tarieven_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regie_tarieven_id_seq OWNED BY public.regie_tarieven.id;


--
-- Name: regie_voorwaarden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regie_voorwaarden (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    contactpersoon_opdrachtgever text,
    akkoordgever_opdrachtgever text,
    projectleider_fps text,
    materiaalopslag real DEFAULT 0 NOT NULL,
    materieelopslag real DEFAULT 0 NOT NULL,
    transportkosten real DEFAULT 0 NOT NULL,
    voorrijkosten real DEFAULT 0 NOT NULL,
    toeslag_avond real DEFAULT 0 NOT NULL,
    toeslag_weekend real DEFAULT 0 NOT NULL,
    toeslag_spoed real DEFAULT 0 NOT NULL,
    betaaltermijn integer DEFAULT 30 NOT NULL,
    facturatiefrequentie text DEFAULT 'maandelijks'::text NOT NULL,
    handtekening_vereist boolean DEFAULT false NOT NULL,
    weekstaat_vereist boolean DEFAULT false NOT NULL,
    fotos_vereist boolean DEFAULT false NOT NULL,
    bewijsvereisten text,
    notities text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: regie_voorwaarden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.regie_voorwaarden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: regie_voorwaarden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.regie_voorwaarden_id_seq OWNED BY public.regie_voorwaarden.id;


--
-- Name: release_update_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.release_update_notes (
    id integer NOT NULL,
    release_id integer NOT NULL,
    toegevoegd text,
    verbeterd text,
    opgelost text,
    beveiliging text,
    bekende_problemen text,
    instructies text
);


--
-- Name: release_update_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.release_update_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: release_update_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.release_update_notes_id_seq OWNED BY public.release_update_notes.id;


--
-- Name: reserveringen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reserveringen (
    id integer NOT NULL,
    artikel_id integer NOT NULL,
    opdracht_id integer,
    hoeveelheid real NOT NULL,
    gereserveerd_op timestamp without time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    omschrijving text,
    aangemaakt_door_id integer,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reserveringen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reserveringen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reserveringen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reserveringen_id_seq OWNED BY public.reserveringen.id;


--
-- Name: salaris_audit_ext; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salaris_audit_ext (
    id integer NOT NULL,
    actie text NOT NULL,
    entity_type text,
    entity_id integer,
    gebruiker_id integer,
    gebruiker_naam text,
    werkmaatschappij text,
    medewerker_id integer,
    detail text,
    tijdstip timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: salaris_audit_ext_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salaris_audit_ext_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salaris_audit_ext_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salaris_audit_ext_id_seq OWNED BY public.salaris_audit_ext.id;


--
-- Name: salaris_mutaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salaris_mutaties (
    id integer NOT NULL,
    medewerker_id integer,
    medewerker_naam text,
    werkmaatschappij text NOT NULL,
    werkgever_id integer,
    periode_jaar integer NOT NULL,
    periode_maand integer NOT NULL,
    type text NOT NULL,
    omschrijving text,
    ingangsdatum text,
    bron text DEFAULT 'handmatig'::text NOT NULL,
    bijlage_object_path text,
    bijlage_naam text,
    bijlage_grootte integer,
    status text DEFAULT 'concept'::text NOT NULL,
    gecontroleerd boolean DEFAULT false NOT NULL,
    gecontroleerd_door_id integer,
    gecontroleerd_door_naam text,
    gecontroleerd_op timestamp without time zone,
    akkoord boolean,
    notities text,
    aangemaakt_door_id integer,
    aangemaakt_door_naam text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: salaris_mutaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salaris_mutaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salaris_mutaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salaris_mutaties_id_seq OWNED BY public.salaris_mutaties.id;


--
-- Name: salarisbatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salarisbatches (
    id integer NOT NULL,
    omschrijving text,
    periode_jaar integer,
    periode_maand integer,
    werkmaatschappij text,
    werkgever_id integer,
    status text DEFAULT 'verwerken'::text NOT NULL,
    uploader_id integer,
    uploader_naam text,
    totaal_bestanden integer DEFAULT 0 NOT NULL,
    gekoppeld integer DEFAULT 0 NOT NULL,
    ongekoppeld integer DEFAULT 0 NOT NULL,
    controle_nodig integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: salarisbatches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salarisbatches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salarisbatches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salarisbatches_id_seq OWNED BY public.salarisbatches.id;


--
-- Name: salarisbestanden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salarisbestanden (
    id integer NOT NULL,
    batch_id integer,
    type text NOT NULL,
    periode_jaar integer,
    periode_maand integer,
    medewerker_id integer,
    medewerker_naam_ai text,
    status text DEFAULT 'geupload'::text NOT NULL,
    zichtbaar_medewerker boolean DEFAULT false NOT NULL,
    bestandsnaam text NOT NULL,
    object_path text NOT NULL,
    bestandsgrootte integer,
    mime_type text,
    uploader_id integer,
    uploader_naam text,
    ai_zekerheid real,
    ai_toelichting text,
    bronbestand_naam text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: salarisbestanden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salarisbestanden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salarisbestanden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salarisbestanden_id_seq OWNED BY public.salarisbestanden.id;


--
-- Name: salarisdocument_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salarisdocument_audit (
    id integer NOT NULL,
    document_id integer,
    sepa_id integer,
    actie text NOT NULL,
    gebruiker_id integer,
    gebruiker_naam text,
    medewerker_id integer,
    document_type text,
    batch_id integer,
    tijdstip timestamp without time zone DEFAULT now() NOT NULL,
    extra jsonb
);


--
-- Name: salarisdocument_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salarisdocument_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salarisdocument_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salarisdocument_audit_id_seq OWNED BY public.salarisdocument_audit.id;


--
-- Name: scab_mail_bijlagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scab_mail_bijlagen (
    id integer NOT NULL,
    scab_mail_id integer,
    type text NOT NULL,
    omschrijving text,
    object_path text NOT NULL,
    bestandsnaam text NOT NULL,
    bestandsgrootte integer,
    is_gevoelig boolean DEFAULT false NOT NULL,
    medewerker_id integer,
    medewerker_naam text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scab_mail_bijlagen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scab_mail_bijlagen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scab_mail_bijlagen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scab_mail_bijlagen_id_seq OWNED BY public.scab_mail_bijlagen.id;


--
-- Name: scab_mails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scab_mails (
    id integer NOT NULL,
    werkmaatschappij text NOT NULL,
    werkgever_id integer,
    periode_jaar integer NOT NULL,
    periode_maand integer NOT NULL,
    onderwerp text NOT NULL,
    inhoud text NOT NULL,
    scab_email_adres text,
    contactpersoon text,
    status text DEFAULT 'concept'::text NOT NULL,
    verzond_op timestamp without time zone,
    verzond_door_id integer,
    verzond_door_naam text,
    aantal_mutaties integer DEFAULT 0 NOT NULL,
    ai_context_json jsonb,
    aangemaakt_door_id integer,
    aangemaakt_door_naam text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scab_mails_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scab_mails_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scab_mails_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scab_mails_id_seq OWNED BY public.scab_mails.id;


--
-- Name: scheidingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheidingen (
    id integer NOT NULL,
    verdieping_id integer NOT NULL,
    type text NOT NULL,
    waarde text,
    kleur text,
    punten text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scheidingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheidingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheidingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheidingen_id_seq OWNED BY public.scheidingen.id;


--
-- Name: security_instellingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_instellingen (
    id integer NOT NULL,
    sleutel text NOT NULL,
    waarde text NOT NULL,
    omschrijving text,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: security_instellingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_instellingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_instellingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_instellingen_id_seq OWNED BY public.security_instellingen.id;


--
-- Name: security_intake_scans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_intake_scans (
    id integer NOT NULL,
    gebruiker_id integer,
    gebruiker_naam text,
    upload_bron text DEFAULT 'document'::text NOT NULL,
    bestandsnaam text,
    bestandsgrootte integer,
    mime_type_claim text,
    mime_type_werkelijk text,
    object_pad text,
    document_id integer,
    email_onderwerp text,
    extensie_status text DEFAULT 'niet_gescand'::text NOT NULL,
    mime_status text DEFAULT 'niet_gescand'::text NOT NULL,
    structuur_status text DEFAULT 'niet_gescand'::text NOT NULL,
    link_status text DEFAULT 'niet_gescand'::text NOT NULL,
    ai_status text DEFAULT 'niet_gescand'::text NOT NULL,
    clamav_status text DEFAULT 'niet_beschikbaar'::text NOT NULL,
    yara_status text DEFAULT 'niet_gescand'::text NOT NULL,
    archief_status text DEFAULT 'niet_gescand'::text NOT NULL,
    quarantaine_pad text,
    risico_niveau text DEFAULT 'groen'::text NOT NULL,
    risico_bevindingen jsonb,
    links_geanalyseerd jsonb,
    ai_samenvatting text,
    actie text DEFAULT 'toegestaan'::text NOT NULL,
    blokker_reden text,
    in_quarantaine boolean DEFAULT false NOT NULL,
    quarantaine_reden text,
    beoordeeld_door_id integer,
    beoordeeld_door_naam text,
    beoordeling_opmerking text,
    beoordeeld_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: security_intake_scans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_intake_scans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_intake_scans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_intake_scans_id_seq OWNED BY public.security_intake_scans.id;


--
-- Name: security_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_releases (
    id integer NOT NULL,
    scan_run_id integer NOT NULL,
    versie_label text,
    status text DEFAULT 'wacht'::text NOT NULL,
    score_totaal real,
    kritiek_mislukt integer DEFAULT 0,
    min_score real DEFAULT 95,
    geblokkeerd boolean DEFAULT false,
    blokkede_reden text,
    goedgekeurd_door text,
    goedgekeurd_op timestamp without time zone,
    afgewezen_door text,
    afgewezen_op timestamp without time zone,
    opmerking text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: security_releases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_releases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_releases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_releases_id_seq OWNED BY public.security_releases.id;


--
-- Name: security_scan_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_scan_runs (
    id integer NOT NULL,
    gestart_op timestamp without time zone DEFAULT now() NOT NULL,
    voltooid_op timestamp without time zone,
    gestart_door integer,
    gestart_door_naam text,
    type text DEFAULT 'handmatig'::text NOT NULL,
    status text DEFAULT 'lopend'::text NOT NULL,
    versie_label text,
    base_url text,
    totaal_tests integer DEFAULT 0,
    geslaagd integer DEFAULT 0,
    mislukt integer DEFAULT 0,
    waarschuwingen integer DEFAULT 0,
    overgeslagen integer DEFAULT 0,
    kritiek_mislukt integer DEFAULT 0,
    score_infrastructuur real,
    score_authenticatie real,
    score_autorisatie real,
    score_api_beveiliging real,
    score_upload_beveiliging real,
    score_malware real,
    score_ai_beveiliging real,
    score_governance real,
    score_business_logica real,
    score_logging real,
    score_email_beveiliging real,
    score_mobiel_beveiliging real,
    score_totaal real,
    release_goedgekeurd boolean,
    release_goedgekeurd_door text,
    release_goedgekeurd_op timestamp without time zone,
    release_opmerking text,
    release_geblokkeerd boolean DEFAULT false,
    release_blokkede_reden text,
    samenvatting jsonb,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: security_scan_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_scan_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_scan_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_scan_runs_id_seq OWNED BY public.security_scan_runs.id;


--
-- Name: security_test_resultaten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_test_resultaten (
    id integer NOT NULL,
    scan_run_id integer NOT NULL,
    test_id text NOT NULL,
    categorie text NOT NULL,
    subcategorie text,
    naam text NOT NULL,
    beschrijving text,
    ernst text NOT NULL,
    uitkomst text NOT NULL,
    bericht text,
    details text,
    aanbeveling text,
    duur_ms integer,
    uitgevoerd_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: security_test_resultaten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.security_test_resultaten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: security_test_resultaten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.security_test_resultaten_id_seq OWNED BY public.security_test_resultaten.id;


--
-- Name: sepa_bestanden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sepa_bestanden (
    id integer NOT NULL,
    omschrijving text,
    werkmaatschappij text,
    werkgever_id integer,
    periode_jaar integer,
    periode_maand integer,
    betaaldatum text,
    totaalbedrag numeric(12,2),
    aantal_betalingen integer,
    iban_opdrachtgever text,
    bestandsformaat text,
    status text DEFAULT 'ontvangen'::text NOT NULL,
    bestandsnaam text NOT NULL,
    object_path text NOT NULL,
    bestandsgrootte integer,
    uploader_id integer,
    uploader_naam text,
    gedownload_door_id integer,
    gedownload_op timestamp without time zone,
    fouten text[],
    batch_referentie text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sepa_bestanden_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sepa_bestanden_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sepa_bestanden_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sepa_bestanden_id_seq OWNED BY public.sepa_bestanden.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: slim_upload_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slim_upload_log (
    id integer NOT NULL,
    gebruiker_id integer,
    bestandsnaam text NOT NULL,
    categorie text NOT NULL,
    actie text NOT NULL,
    impact_niveau text DEFAULT 'geen'::text NOT NULL,
    bevestigd boolean DEFAULT false NOT NULL,
    geweigerd boolean DEFAULT false NOT NULL,
    opmerking text,
    ip_adres text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: slim_upload_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.slim_upload_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: slim_upload_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.slim_upload_log_id_seq OWNED BY public.slim_upload_log.id;


--
-- Name: snagstream_rapporten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.snagstream_rapporten (
    id integer NOT NULL,
    bestandsnaam text NOT NULL,
    pdf_url text NOT NULL,
    rapportdatum text,
    opdrachtgever text,
    project_naam text,
    status text DEFAULT 'nieuw'::text NOT NULL,
    gebouw_id integer,
    ai_metadata jsonb,
    uploader_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: snagstream_rapporten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.snagstream_rapporten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: snagstream_rapporten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.snagstream_rapporten_id_seq OWNED BY public.snagstream_rapporten.id;


--
-- Name: snagstream_snags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.snagstream_snags (
    id integer NOT NULL,
    rapport_id integer NOT NULL,
    snagnummer text,
    verdieping text,
    ruimte text,
    omschrijving text,
    type_naam text,
    applicatie_naam text,
    label_naam text,
    toepassing_naam text,
    classificatie text,
    status_origineel text,
    opmerkingen text,
    foto_url text,
    pdf_pagina integer,
    pdf_x real,
    pdf_y real,
    confidence_scores jsonb,
    overgenomen boolean DEFAULT false NOT NULL,
    overgenomen_als_voorziening_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: snagstream_snags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.snagstream_snags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: snagstream_snags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.snagstream_snags_id_seq OWNED BY public.snagstream_snags.id;


--
-- Name: spot_ai_voorstellen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spot_ai_voorstellen (
    id integer NOT NULL,
    voorziening_id integer,
    gebouw_id integer,
    foto_voor_url text,
    foto_na_url text,
    voorstel jsonb,
    gekozen jsonb,
    afwijking_toepassing boolean DEFAULT false NOT NULL,
    beheerder_bevestigd_door_id integer,
    beheerder_bevestigd_op timestamp without time zone,
    herkomst text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: spot_ai_voorstellen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spot_ai_voorstellen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spot_ai_voorstellen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spot_ai_voorstellen_id_seq OWNED BY public.spot_ai_voorstellen.id;


--
-- Name: spot_dossiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spot_dossiers (
    id integer NOT NULL,
    voorziening_id integer NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: spot_dossiers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spot_dossiers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spot_dossiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spot_dossiers_id_seq OWNED BY public.spot_dossiers.id;


--
-- Name: spot_status_configuratie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spot_status_configuratie (
    status_code text NOT NULL,
    weergave_naam text NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    fase_groep text DEFAULT 'operationeel'::text NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tekeningen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tekeningen (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    verdieping_id integer,
    naam text NOT NULL,
    type text NOT NULL,
    schaal text,
    url text NOT NULL,
    zichtbaar_monteur boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: tekeningen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tekeningen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tekeningen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tekeningen_id_seq OWNED BY public.tekeningen.id;


--
-- Name: testrapporten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testrapporten (
    id integer NOT NULL,
    naam text NOT NULL,
    fabrikant text,
    norm text,
    rapportnummer text,
    pdf_url text,
    gearchiveerd boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: testrapporten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.testrapporten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: testrapporten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.testrapporten_id_seq OWNED BY public.testrapporten.id;


--
-- Name: toolbox_berichten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.toolbox_berichten (
    id integer NOT NULL,
    titel text NOT NULL,
    inhoud text NOT NULL,
    bijlagen jsonb DEFAULT '[]'::jsonb NOT NULL,
    doelgroep text DEFAULT 'iedereen'::text NOT NULL,
    doelgroep_gebruiker_id integer,
    aangemaakt_door_id integer,
    gepubliceerd boolean DEFAULT false NOT NULL,
    gepubliceerd_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    is_belangrijk boolean,
    gearchiveerd boolean DEFAULT false NOT NULL,
    gearchiveerd_op timestamp without time zone,
    ai_verwerkt_op timestamp without time zone,
    koppelingen jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: toolbox_berichten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.toolbox_berichten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: toolbox_berichten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.toolbox_berichten_id_seq OWNED BY public.toolbox_berichten.id;


--
-- Name: toolbox_maand_opdrachten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.toolbox_maand_opdrachten (
    id integer NOT NULL,
    toolbox_id integer NOT NULL,
    jaar integer NOT NULL,
    maand integer NOT NULL,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: toolbox_maand_opdrachten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.toolbox_maand_opdrachten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: toolbox_maand_opdrachten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.toolbox_maand_opdrachten_id_seq OWNED BY public.toolbox_maand_opdrachten.id;


--
-- Name: toolbox_maand_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.toolbox_maand_status (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    eerste_aanbieding timestamp without time zone DEFAULT now() NOT NULL,
    aantal_uitgesteld integer DEFAULT 0 NOT NULL,
    laatste_uitgesteld timestamp without time zone,
    vraag text,
    voltooid_op timestamp without time zone,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: toolbox_maand_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.toolbox_maand_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: toolbox_maand_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.toolbox_maand_status_id_seq OWNED BY public.toolbox_maand_status.id;


--
-- Name: uitvoerder_berichten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uitvoerder_berichten (
    id integer NOT NULL,
    sessie_id integer NOT NULL,
    rol text NOT NULL,
    inhoud text NOT NULL,
    foto_pad text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: uitvoerder_berichten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uitvoerder_berichten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uitvoerder_berichten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uitvoerder_berichten_id_seq OWNED BY public.uitvoerder_berichten.id;


--
-- Name: uitvoerder_sessies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uitvoerder_sessies (
    id integer NOT NULL,
    werkdag_id integer,
    opdracht_id integer,
    monteur_id integer NOT NULL,
    status text DEFAULT 'actief'::text NOT NULL,
    gekozen_aanpak text,
    gekozen_aanpak_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: uitvoerder_sessies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uitvoerder_sessies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uitvoerder_sessies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uitvoerder_sessies_id_seq OWNED BY public.uitvoerder_sessies.id;


--
-- Name: uitvoeringsplan_taken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uitvoeringsplan_taken (
    id integer NOT NULL,
    uitvoeringsplan_id integer NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    fase text,
    omschrijving text NOT NULL,
    discipline text,
    duur_dagen integer,
    benodigde_medewerkers integer,
    urenbegroting real,
    afhankelijk_van_ids text,
    materiaal_moment text,
    ai_motivatie text,
    opmerkingen text,
    ai_gegenereerd boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: uitvoeringsplan_taken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uitvoeringsplan_taken_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uitvoeringsplan_taken_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uitvoeringsplan_taken_id_seq OWNED BY public.uitvoeringsplan_taken.id;


--
-- Name: uitvoeringsplannen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uitvoeringsplannen (
    id integer NOT NULL,
    opdracht_id integer NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    ai_gegenereerd boolean DEFAULT false NOT NULL,
    ai_gegenereerd_op timestamp without time zone,
    ai_samenvatting text,
    startdatum text,
    einddatum text,
    totaal_weken integer,
    vastgesteld_op timestamp without time zone,
    vastgesteld_door_id integer,
    opmerkingen text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: uitvoeringsplannen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uitvoeringsplannen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uitvoeringsplannen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uitvoeringsplannen_id_seq OWNED BY public.uitvoeringsplannen.id;


--
-- Name: uren_registraties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uren_registraties (
    id integer NOT NULL,
    datum text NOT NULL,
    medewerker_id integer NOT NULL,
    gebouw_id integer,
    project_id integer,
    project_naam text,
    werkzaamheden text,
    werkzaamheid_categorie text,
    ruimte text,
    object_omschrijving text,
    begin_tijd text NOT NULL,
    eind_tijd text NOT NULL,
    pauze_minuten integer DEFAULT 30 NOT NULL,
    netto_uren real NOT NULL,
    opmerkingen text,
    status text DEFAULT 'concept'::text NOT NULL,
    planning_item_id integer,
    opdracht_id integer,
    ingediend_op timestamp without time zone,
    goedgekeurd_door_id integer,
    goedgekeurd_op timestamp without time zone,
    afgewezen boolean DEFAULT false NOT NULL,
    afwijzing_reden text,
    tariefgroep text,
    reis_uren real,
    wacht_tijd real,
    akkoord_vereist boolean DEFAULT false NOT NULL,
    akkoord_gegeven boolean,
    akkoord_door_naam text,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: uren_registraties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uren_registraties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uren_registraties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uren_registraties_id_seq OWNED BY public.uren_registraties.id;


--
-- Name: veiligheid_incidenten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheid_incidenten (
    id integer NOT NULL,
    type text DEFAULT 'bijna_ongeval'::text NOT NULL,
    datum text,
    tijdstip text,
    locatie_omschrijving text NOT NULL,
    gebouw_id integer,
    opdracht_id integer,
    omschrijving text NOT NULL,
    oorzaak text,
    letsel_beschrijving text,
    eerste_hulp_verleend boolean DEFAULT false NOT NULL,
    eerste_hulp_beschrijving text,
    getuigen jsonb DEFAULT '[]'::jsonb NOT NULL,
    genomen_maatregelen jsonb DEFAULT '[]'::jsonb NOT NULL,
    meldplichtig boolean DEFAULT false NOT NULL,
    gemeld_bij_arbeidsinspectie boolean DEFAULT false NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    foto_paden jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_voorstel boolean DEFAULT false NOT NULL,
    medewerker_naam text,
    medewerker_id integer,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: veiligheid_incidenten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheid_incidenten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheid_incidenten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheid_incidenten_id_seq OWNED BY public.veiligheid_incidenten.id;


--
-- Name: veiligheid_lmras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheid_lmras (
    id integer NOT NULL,
    gebouw_id integer,
    project_naam text,
    locatie_omschrijving text NOT NULL,
    werkzaamheden text NOT NULL,
    risicos jsonb DEFAULT '[]'::jsonb NOT NULL,
    maatregelen jsonb DEFAULT '[]'::jsonb NOT NULL,
    veilig_voor_aanvang boolean DEFAULT true NOT NULL,
    handtekening text,
    foto_paden jsonb DEFAULT '[]'::jsonb NOT NULL,
    gps_lat text,
    gps_lng text,
    medewerker_naam text,
    medewerker_id integer,
    ai_voorstel boolean DEFAULT false NOT NULL,
    opdracht_id integer,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: veiligheid_lmras_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheid_lmras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheid_lmras_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheid_lmras_id_seq OWNED BY public.veiligheid_lmras.id;


--
-- Name: veiligheid_meldingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheid_meldingen (
    id integer NOT NULL,
    type text DEFAULT 'onveilige_situatie'::text NOT NULL,
    omschrijving text NOT NULL,
    locatie text,
    gebouw_id integer,
    project_naam text,
    foto_paden jsonb DEFAULT '[]'::jsonb NOT NULL,
    prioriteit text DEFAULT 'middel'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    melder_naam text,
    gemeld_door_id integer,
    toegewezen_aan_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: veiligheid_meldingen_acties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheid_meldingen_acties (
    id integer NOT NULL,
    melding_id integer NOT NULL,
    omschrijving text NOT NULL,
    eigenaar_id integer,
    eigenaar_naam text,
    deadline text,
    status text DEFAULT 'open'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: veiligheid_meldingen_acties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheid_meldingen_acties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheid_meldingen_acties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheid_meldingen_acties_id_seq OWNED BY public.veiligheid_meldingen_acties.id;


--
-- Name: veiligheid_meldingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheid_meldingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheid_meldingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheid_meldingen_id_seq OWNED BY public.veiligheid_meldingen.id;


--
-- Name: veiligheid_toolbox_afrondingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheid_toolbox_afrondingen (
    id integer NOT NULL,
    toolbox_id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    score integer NOT NULL,
    max_score integer NOT NULL,
    handtekening text,
    bevestigd_op timestamp without time zone DEFAULT now() NOT NULL,
    geldig_tot timestamp without time zone
);


--
-- Name: veiligheid_toolbox_afrondingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheid_toolbox_afrondingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheid_toolbox_afrondingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheid_toolbox_afrondingen_id_seq OWNED BY public.veiligheid_toolbox_afrondingen.id;


--
-- Name: veiligheid_toolbox_vragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheid_toolbox_vragen (
    id integer NOT NULL,
    toolbox_id integer NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    vraag text NOT NULL,
    opties jsonb DEFAULT '[]'::jsonb NOT NULL,
    uitleg text
);


--
-- Name: veiligheid_toolbox_vragen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheid_toolbox_vragen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheid_toolbox_vragen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheid_toolbox_vragen_id_seq OWNED BY public.veiligheid_toolbox_vragen.id;


--
-- Name: veiligheid_toolboxen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheid_toolboxen (
    id integer NOT NULL,
    titel text NOT NULL,
    categorie text DEFAULT 'overig'::text NOT NULL,
    moeilijkheid text DEFAULT 'gemiddeld'::text NOT NULL,
    geschatte_leestijd integer,
    intro text,
    ai_samenvatting text,
    ai_risicos jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_maatregelen jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_fouten jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_stoppen text,
    pdf_pad text,
    video_url text,
    afbeeldingen jsonb DEFAULT '[]'::jsonb NOT NULL,
    min_score integer DEFAULT 70 NOT NULL,
    geldigheid_maanden integer DEFAULT 12 NOT NULL,
    gepubliceerd boolean DEFAULT false NOT NULL,
    verplicht boolean DEFAULT false NOT NULL,
    doelgroep text DEFAULT 'iedereen'::text NOT NULL,
    doelgroep_details jsonb DEFAULT '{}'::jsonb NOT NULL,
    aangemaakt_door_id integer,
    ai_verwerkt_op timestamp without time zone,
    ai_gegenereerd boolean DEFAULT false NOT NULL,
    foto_suggesties jsonb DEFAULT '[]'::jsonb NOT NULL,
    zoekwoorden jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: veiligheid_toolboxen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheid_toolboxen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheid_toolboxen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheid_toolboxen_id_seq OWNED BY public.veiligheid_toolboxen.id;


--
-- Name: veiligheidsmiddel_inspecties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheidsmiddel_inspecties (
    id integer NOT NULL,
    middel_id integer NOT NULL,
    datum text NOT NULL,
    foto_paden jsonb DEFAULT '[]'::jsonb NOT NULL,
    bevindingen text,
    ai_beoordeling text,
    ai_aanbeveling text,
    ai_keur_nodig boolean DEFAULT false NOT NULL,
    formele_status text DEFAULT 'in_behandeling'::text NOT NULL,
    beoordeeld_door_id integer,
    beoordeeld_door_naam text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: veiligheidsmiddel_inspecties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheidsmiddel_inspecties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheidsmiddel_inspecties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheidsmiddel_inspecties_id_seq OWNED BY public.veiligheidsmiddel_inspecties.id;


--
-- Name: veiligheidsmiddelen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veiligheidsmiddelen (
    id integer NOT NULL,
    type text NOT NULL,
    naam text NOT NULL,
    merk text,
    model text,
    serienummer text,
    locatie text,
    eigenaar_id integer,
    eigenaar_naam text,
    keurings_interval_maanden integer,
    aanschaf_datum text,
    vervangings_datum text,
    status text DEFAULT 'actief'::text NOT NULL,
    foto_paden jsonb DEFAULT '[]'::jsonb NOT NULL,
    handleiding_pad text,
    opmerkingen text,
    qr_code text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: veiligheidsmiddelen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veiligheidsmiddelen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veiligheidsmiddelen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veiligheidsmiddelen_id_seq OWNED BY public.veiligheidsmiddelen.id;


--
-- Name: verdiepingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verdiepingen (
    id integer NOT NULL,
    gebouw_id integer NOT NULL,
    naam text NOT NULL,
    niveau integer DEFAULT 0 NOT NULL,
    plattegrond_url text,
    breedte real,
    hoogte real,
    logo_x real,
    logo_y real,
    logo_breedte real,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: verdiepingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verdiepingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verdiepingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verdiepingen_id_seq OWNED BY public.verdiepingen.id;


--
-- Name: verlof_aanvraag_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verlof_aanvraag_log (
    id integer NOT NULL,
    verlofaanvraag_id integer NOT NULL,
    medewerker_id integer NOT NULL,
    uitgevoerd_door_id integer,
    actie text NOT NULL,
    oud_status text,
    nieuw_status text,
    opmerking text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: verlof_aanvraag_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verlof_aanvraag_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verlof_aanvraag_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verlof_aanvraag_log_id_seq OWNED BY public.verlof_aanvraag_log.id;


--
-- Name: verlof_correcties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verlof_correcties (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    verlofsoort_id integer NOT NULL,
    jaar integer NOT NULL,
    delta_uren real NOT NULL,
    reden text NOT NULL,
    uitgevoerd_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: verlof_correcties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verlof_correcties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verlof_correcties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verlof_correcties_id_seq OWNED BY public.verlof_correcties.id;


--
-- Name: verlof_instellingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verlof_instellingen (
    id integer NOT NULL,
    werkgever_id integer,
    jaar integer NOT NULL,
    max_aaneengesloten integer,
    aanvraag_termijn_dagen integer,
    goedkeuring_automatisch boolean DEFAULT false NOT NULL,
    auto_goedkeuring_drempel_uren real,
    notificatie_email text,
    opmerking text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: verlof_instellingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verlof_instellingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verlof_instellingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verlof_instellingen_id_seq OWNED BY public.verlof_instellingen.id;


--
-- Name: verlof_saldi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verlof_saldi (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    verlofsoort_id integer NOT NULL,
    jaar integer NOT NULL,
    beginsaldo_uren real DEFAULT 0 NOT NULL,
    opgebouwd_uren real DEFAULT 0 NOT NULL,
    opgenomen_uren real DEFAULT 0 NOT NULL,
    saldo_uren real DEFAULT 0 NOT NULL,
    vervalt_op text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: verlof_saldi_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verlof_saldi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verlof_saldi_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verlof_saldi_id_seq OWNED BY public.verlof_saldi.id;


--
-- Name: verlofaanvragen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verlofaanvragen (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    verlofsoort_id integer NOT NULL,
    start_datum text NOT NULL,
    eind_datum text NOT NULL,
    aantal_uren real DEFAULT 0 NOT NULL,
    status text DEFAULT 'aangevraagd'::text NOT NULL,
    reden text,
    opmerking text,
    beoordeeld_door_id integer,
    beoordeeld_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    bezetting_overschreden boolean DEFAULT false NOT NULL
);


--
-- Name: verlofaanvragen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verlofaanvragen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verlofaanvragen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verlofaanvragen_id_seq OWNED BY public.verlofaanvragen.id;


--
-- Name: verlofsoorten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verlofsoorten (
    id integer NOT NULL,
    naam text NOT NULL,
    categorie text DEFAULT 'wettelijk'::text NOT NULL,
    cao text,
    werkmaatschappij text,
    werkgever_id integer,
    betaald boolean DEFAULT true NOT NULL,
    collectief boolean DEFAULT false NOT NULL,
    opbouw_uren_per_jaar real,
    opbouw_regel text,
    verval_regel text,
    juridisch_kader text,
    toelichting text,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    hoofdcategorie text DEFAULT 'overig'::text NOT NULL,
    is_tijd_voor_tijd boolean DEFAULT false NOT NULL
);


--
-- Name: verlofsoorten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.verlofsoorten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: verlofsoorten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.verlofsoorten_id_seq OWNED BY public.verlofsoorten.id;


--
-- Name: vge_effectiviteitslog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vge_effectiviteitslog (
    id integer NOT NULL,
    visual_id integer NOT NULL,
    pim_stap_id integer NOT NULL,
    stap_type text NOT NULL,
    spot_type text NOT NULL,
    herstelwerk_nodig boolean NOT NULL,
    stap_duur_seconden integer,
    monteur_vraag_gesteld boolean DEFAULT false NOT NULL,
    kwaliteit_resultaat text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: vge_effectiviteitslog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vge_effectiviteitslog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vge_effectiviteitslog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vge_effectiviteitslog_id_seq OWNED BY public.vge_effectiviteitslog.id;


--
-- Name: voertuigen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voertuigen (
    id integer NOT NULL,
    kenteken text NOT NULL,
    merk text NOT NULL,
    type text NOT NULL,
    bouwjaar integer,
    kleur text,
    chassisnummer text,
    km_stand integer DEFAULT 0 NOT NULL,
    km_stand_datum timestamp without time zone,
    apk_datum timestamp without time zone,
    onderhouds_interval_km integer,
    onderhouds_interval_dag integer,
    llaatst_onderhoud_km integer,
    llaatste_onderhoud_datum timestamp without time zone,
    bandenwissels_status text DEFAULT 'geen_actie'::text NOT NULL,
    verzekeraar_naam text,
    verzekering_polisnr text,
    verzekering_verval_dat timestamp without time zone,
    eigendoms_type text DEFAULT 'eigendom'::text NOT NULL,
    leasemaatschappij text,
    lease_eind_datum timestamp without time zone,
    lease_km_jaarlijks integer,
    chauffeur_id integer,
    provider_voertuig_id text,
    fleet_provider text,
    werkgever_id integer,
    status text DEFAULT 'actief'::text NOT NULL,
    opmerkingen text,
    gearchiveerd boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: voertuigen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voertuigen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voertuigen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voertuigen_id_seq OWNED BY public.voertuigen.id;


--
-- Name: voorraad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voorraad (
    id integer NOT NULL,
    artikel_id integer NOT NULL,
    locatie_id integer,
    hoeveelheid real DEFAULT 0 NOT NULL,
    gereserveerd real DEFAULT 0 NOT NULL,
    besteld real DEFAULT 0 NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: voorraad_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voorraad_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voorraad_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voorraad_id_seq OWNED BY public.voorraad.id;


--
-- Name: voorraad_mutaties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voorraad_mutaties (
    id integer NOT NULL,
    artikel_id integer NOT NULL,
    locatie_id integer,
    type text NOT NULL,
    hoeveelheid real NOT NULL,
    delta real NOT NULL,
    referentie_type text,
    referentie_id integer,
    opdracht_id integer,
    gebruiker_id integer,
    omschrijving text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    accountview_export_op timestamp without time zone
);


--
-- Name: voorraad_mutaties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voorraad_mutaties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voorraad_mutaties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voorraad_mutaties_id_seq OWNED BY public.voorraad_mutaties.id;


--
-- Name: voorziening_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voorziening_labels (
    id integer NOT NULL,
    voorziening_id integer NOT NULL,
    label_id integer NOT NULL
);


--
-- Name: voorziening_labels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voorziening_labels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voorziening_labels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voorziening_labels_id_seq OWNED BY public.voorziening_labels.id;


--
-- Name: voorziening_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voorziening_types (
    code text NOT NULL,
    naam text NOT NULL,
    categorie text NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    actief boolean DEFAULT true NOT NULL
);


--
-- Name: voorzieningen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voorzieningen (
    id integer NOT NULL,
    objectnummer text NOT NULL,
    qr_code text,
    type text NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    classificatie text DEFAULT '60'::text NOT NULL,
    gebouw_id integer NOT NULL,
    verdieping_id integer,
    ruimte text,
    huisnummer text,
    locatie_omschrijving text,
    locatie_x real,
    locatie_y real,
    materialen text,
    opmerkingen text,
    wbdbo text,
    wrd text,
    wand_of_plafond text,
    cluster_id integer,
    monteur_id integer,
    maker_monteur_id integer,
    controleur_id integer,
    installatie_datum text,
    volgende_inspectie text,
    ai_te_controleren boolean DEFAULT false NOT NULL,
    ai_voorstel_id integer,
    parent_spot_id integer,
    gearchiveerd boolean DEFAULT false NOT NULL,
    gearchiveerd_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    applicaties jsonb
);


--
-- Name: voorzieningen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.voorzieningen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: voorzieningen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.voorzieningen_id_seq OWNED BY public.voorzieningen.id;


--
-- Name: wachtwoord_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wachtwoord_reset_tokens (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    token text NOT NULL,
    verloopt_op timestamp without time zone NOT NULL,
    gebruikt_op timestamp without time zone,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wachtwoord_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wachtwoord_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wachtwoord_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wachtwoord_reset_tokens_id_seq OWNED BY public.wachtwoord_reset_tokens.id;


--
-- Name: wagenpark_avg_logboek; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wagenpark_avg_logboek (
    id integer NOT NULL,
    datum timestamp without time zone DEFAULT now() NOT NULL,
    actie text NOT NULL,
    voertuig_id integer,
    gebruiker_id integer,
    reden text,
    datatype text,
    bewaartermijn text,
    bijzonderheden text
);


--
-- Name: wagenpark_avg_logboek_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wagenpark_avg_logboek_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wagenpark_avg_logboek_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wagenpark_avg_logboek_id_seq OWNED BY public.wagenpark_avg_logboek.id;


--
-- Name: wagenpark_kosten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wagenpark_kosten (
    id integer NOT NULL,
    voertuig_id integer NOT NULL,
    categorie text NOT NULL,
    bedrag real NOT NULL,
    datum timestamp without time zone NOT NULL,
    omschrijving text,
    leverancier text,
    factuur_nummer text,
    factuur_document_id integer,
    km_stand integer,
    project_id integer,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wagenpark_kosten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wagenpark_kosten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wagenpark_kosten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wagenpark_kosten_id_seq OWNED BY public.wagenpark_kosten.id;


--
-- Name: wagenpark_kwartaalcontrole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wagenpark_kwartaalcontrole (
    id integer NOT NULL,
    voertuig_id integer NOT NULL,
    periode_start timestamp without time zone NOT NULL,
    deadline timestamp without time zone NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    melding_id integer,
    laatste_herinnering_op timestamp without time zone,
    aantal_herinneringen integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wagenpark_kwartaalcontrole_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wagenpark_kwartaalcontrole_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wagenpark_kwartaalcontrole_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wagenpark_kwartaalcontrole_id_seq OWNED BY public.wagenpark_kwartaalcontrole.id;


--
-- Name: wagenpark_meldingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wagenpark_meldingen (
    id integer NOT NULL,
    voertuig_id integer NOT NULL,
    gemeld_door_id integer,
    type text DEFAULT 'storing'::text NOT NULL,
    omschrijving text NOT NULL,
    foto_paden text[] DEFAULT '{}'::text[] NOT NULL,
    ai_diagnose text,
    ai_oplossing text,
    ai_kosten_indicatie boolean DEFAULT false NOT NULL,
    ai_kosten_tekst text,
    status text DEFAULT 'nieuw'::text NOT NULL,
    admin_notitie text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    schade_locatie text,
    storing_type text,
    ai_fotokwaliteit_ok boolean,
    ai_gelezen_km_stand integer,
    ai_gelezen_waarschuwingen jsonb,
    ai_ernst_indicatie text,
    ai_mogelijk_duplicaat_van_id integer,
    toegewezen_beheerder_id integer,
    onderhoud_id integer,
    opvolg_notitie text
);


--
-- Name: wagenpark_meldingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wagenpark_meldingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wagenpark_meldingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wagenpark_meldingen_id_seq OWNED BY public.wagenpark_meldingen.id;


--
-- Name: wagenpark_onderhoud; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wagenpark_onderhoud (
    id integer NOT NULL,
    voertuig_id integer NOT NULL,
    type text NOT NULL,
    omschrijving text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    prioriteit text DEFAULT 'normaal'::text NOT NULL,
    km_stand_bij_melding integer,
    gepland_datum timestamp without time zone,
    afgerond_datum timestamp without time zone,
    kosten real,
    leverancier text,
    is_ai_voorstel boolean DEFAULT false NOT NULL,
    ai_reden text,
    geaccordeerd boolean DEFAULT false NOT NULL,
    gemeld_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wagenpark_onderhoud_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wagenpark_onderhoud_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wagenpark_onderhoud_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wagenpark_onderhoud_id_seq OWNED BY public.wagenpark_onderhoud.id;


--
-- Name: wagenpark_ritten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wagenpark_ritten (
    id integer NOT NULL,
    voertuig_id integer NOT NULL,
    start_datum timestamp without time zone NOT NULL,
    eind_datum timestamp without time zone,
    km_start integer,
    km_eind integer,
    afstand_km real,
    vertrek_adres text,
    bestemming_adres text,
    doel text,
    project_id integer,
    provider_rit_id text,
    bron text DEFAULT 'handmatig'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: wagenpark_ritten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wagenpark_ritten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wagenpark_ritten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wagenpark_ritten_id_seq OWNED BY public.wagenpark_ritten.id;


--
-- Name: wagenpark_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wagenpark_sync_log (
    id integer NOT NULL,
    provider text DEFAULT 'traxgo'::text NOT NULL,
    status text NOT NULL,
    aantal_bijgewerkt integer DEFAULT 0 NOT NULL,
    aantal_fouten integer DEFAULT 0 NOT NULL,
    foutmelding text,
    details jsonb,
    gestart_op timestamp without time zone DEFAULT now() NOT NULL,
    voltooid_op timestamp without time zone,
    gestart_door_id integer
);


--
-- Name: wagenpark_sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wagenpark_sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wagenpark_sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wagenpark_sync_log_id_seq OWNED BY public.wagenpark_sync_log.id;


--
-- Name: week_staten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.week_staten (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    jaar integer NOT NULL,
    week_nummer integer NOT NULL,
    status text DEFAULT 'concept'::text NOT NULL,
    totaal_uren real,
    adv_uren real,
    notities text,
    afwijzing_reden text,
    ingediend_op timestamp without time zone,
    goedgekeurd_door_id integer,
    goedgekeurd_op timestamp without time zone,
    document_id integer,
    vergrendeld boolean DEFAULT false NOT NULL,
    vergrendeld_op timestamp without time zone,
    vergrendeld_door_id integer,
    aangemaakt_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: week_staten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.week_staten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: week_staten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.week_staten_id_seq OWNED BY public.week_staten.id;


--
-- Name: werk_inbox_koppelingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werk_inbox_koppelingen (
    id integer NOT NULL,
    message_id text NOT NULL,
    gebruiker_id integer NOT NULL,
    entity_type text NOT NULL,
    entity_id integer NOT NULL,
    entity_label text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: werk_inbox_koppelingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werk_inbox_koppelingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werk_inbox_koppelingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werk_inbox_koppelingen_id_seq OWNED BY public.werk_inbox_koppelingen.id;


--
-- Name: werk_inbox_mailboxen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werk_inbox_mailboxen (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    email_adres text NOT NULL,
    label text,
    volgorde integer DEFAULT 0 NOT NULL,
    actief boolean DEFAULT true NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    is_factuurmailbox boolean DEFAULT false NOT NULL,
    is_aanvraagmailbox boolean DEFAULT false NOT NULL
);


--
-- Name: werk_inbox_mailboxen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werk_inbox_mailboxen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werk_inbox_mailboxen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werk_inbox_mailboxen_id_seq OWNED BY public.werk_inbox_mailboxen.id;


--
-- Name: werk_inbox_mails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werk_inbox_mails (
    id integer NOT NULL,
    message_id text NOT NULL,
    gebruiker_id integer NOT NULL,
    mailbox_adres text NOT NULL,
    onderwerp text DEFAULT ''::text NOT NULL,
    afzender_naam text,
    afzender_email text DEFAULT ''::text NOT NULL,
    ontvangen_op timestamp without time zone NOT NULL,
    snippet text,
    heeft_bijlage boolean DEFAULT false NOT NULL,
    is_gelezen_ms boolean DEFAULT false NOT NULL,
    verwerkt_op timestamp without time zone,
    afgehandeld_op timestamp without time zone,
    actie_vereist boolean DEFAULT false NOT NULL,
    actie_vereist_reden text,
    ai_voorstel_json text,
    ai_logboek_json text,
    relatie_categorie_ai text,
    gesynchroniseerd_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    conversation_id text,
    factuur_verwerkt_op timestamp without time zone,
    aanvraag_verwerkt_op timestamp without time zone
);


--
-- Name: werk_inbox_mails_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werk_inbox_mails_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werk_inbox_mails_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werk_inbox_mails_id_seq OWNED BY public.werk_inbox_mails.id;


--
-- Name: werk_inbox_notities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werk_inbox_notities (
    id integer NOT NULL,
    message_id text NOT NULL,
    gebruiker_id integer NOT NULL,
    tekst text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: werk_inbox_notities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werk_inbox_notities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werk_inbox_notities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werk_inbox_notities_id_seq OWNED BY public.werk_inbox_notities.id;


--
-- Name: werk_inbox_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werk_inbox_tokens (
    id integer NOT NULL,
    gebruiker_id integer NOT NULL,
    microsoft_email text NOT NULL,
    access_token_enc text NOT NULL,
    refresh_token_enc text NOT NULL,
    verloopt_op timestamp without time zone NOT NULL,
    scope text DEFAULT 'Mail.Read offline_access'::text NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    aanvraag_intake_persoonlijk boolean DEFAULT false NOT NULL
);


--
-- Name: werk_inbox_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werk_inbox_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werk_inbox_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werk_inbox_tokens_id_seq OWNED BY public.werk_inbox_tokens.id;


--
-- Name: werkbegroting_adviezen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werkbegroting_adviezen (
    id integer NOT NULL,
    begroting_id integer NOT NULL,
    run_id text NOT NULL,
    type text NOT NULL,
    prioriteit text DEFAULT 'middel'::text NOT NULL,
    titel text NOT NULL,
    uitleg text NOT NULL,
    status text DEFAULT 'actief'::text NOT NULL,
    notitie text,
    aangemaakt_op timestamp with time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: werkbegroting_adviezen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werkbegroting_adviezen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werkbegroting_adviezen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werkbegroting_adviezen_id_seq OWNED BY public.werkbegroting_adviezen.id;


--
-- Name: werkbegroting_regels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werkbegroting_regels (
    id integer NOT NULL,
    begroting_id integer NOT NULL,
    calc_regel_id integer,
    categorie text DEFAULT 'arbeid'::text NOT NULL,
    omschrijving text NOT NULL,
    eenheid text DEFAULT 'uur'::text NOT NULL,
    hoeveelheid real DEFAULT 0 NOT NULL,
    tarief real DEFAULT 0 NOT NULL,
    totaal real DEFAULT 0 NOT NULL,
    hoofdstuk text DEFAULT 'Overige werkzaamheden'::text NOT NULL,
    ai_inkoop_voorstel text,
    ai_arbeid_voorstel text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: werkbegroting_regels_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werkbegroting_regels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werkbegroting_regels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werkbegroting_regels_id_seq OWNED BY public.werkbegroting_regels.id;


--
-- Name: werkbonnen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werkbonnen (
    id integer NOT NULL,
    werkbonnummer text NOT NULL,
    contract_id integer,
    gebouw_id integer,
    titel text NOT NULL,
    omschrijving text,
    type text DEFAULT 'preventief'::text NOT NULL,
    geplande_kwartaal text,
    geplande_periode_van text,
    geplande_periode_tot text,
    geplande_datum text,
    uitvoer_datum text,
    monteur_id integer,
    duur_uren numeric(5,1),
    status text DEFAULT 'gepland'::text NOT NULL,
    opmerkingen text,
    resultaat text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: werkbonnen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werkbonnen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werkbonnen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werkbonnen_id_seq OWNED BY public.werkbonnen.id;


--
-- Name: werkgevers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.werkgevers (
    id integer NOT NULL,
    naam text NOT NULL,
    cao text DEFAULT 'Metaal & Techniek'::text NOT NULL,
    logo_document_id integer,
    briefpapier_document_id integer,
    personeelsbeleid text,
    adres text,
    postcode text,
    plaats text,
    kvk text,
    btw text,
    telefoon text,
    email text,
    website text,
    voettekst text,
    handtekening_url text,
    logo_url text,
    primaire_kleur text DEFAULT '#F23B0D'::text,
    actief boolean DEFAULT true NOT NULL,
    salarisverwerker text,
    boekhouder_naam text,
    boekhouder_email text,
    loonperiode text DEFAULT 'maandelijks'::text,
    intern_contact_naam text,
    intern_contact_email text,
    scab_email_adres text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    iban text,
    koptekst_positie text,
    voettekst_positie text,
    marge_boven numeric(6,2),
    marge_onder numeric(6,2),
    marge_links numeric(6,2),
    marge_rechts numeric(6,2)
);


--
-- Name: werkgevers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.werkgevers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: werkgevers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.werkgevers_id_seq OWNED BY public.werkgevers.id;


--
-- Name: workflow_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_cards (
    id integer NOT NULL,
    workflow_id integer NOT NULL,
    lane_id integer NOT NULL,
    type text DEFAULT 'stap'::text NOT NULL,
    titel text NOT NULL,
    omschrijving text,
    invoer text,
    uitvoer text,
    rol text,
    ai_taak text,
    akkoord_door text,
    gekoppelde_module text,
    uitzonderingsroute text,
    actief boolean DEFAULT true NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL,
    betrokken_functies text[] DEFAULT '{}'::text[] NOT NULL,
    primaire_functie text,
    modules text[] DEFAULT '{}'::text[] NOT NULL,
    objecten_gebruikt text[] DEFAULT '{}'::text[] NOT NULL,
    objecten_gewijzigd text[] DEFAULT '{}'::text[] NOT NULL,
    ai_acties text[] DEFAULT '{}'::text[] NOT NULL,
    beslisregels text[] DEFAULT '{}'::text[] NOT NULL,
    vervolgacties text[] DEFAULT '{}'::text[] NOT NULL,
    impact_workflows text[] DEFAULT '{}'::text[] NOT NULL,
    kleur text,
    hoofdverantwoordelijke text,
    vervanger text,
    benodigde_rechten text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: workflow_cards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_cards_id_seq OWNED BY public.workflow_cards.id;


--
-- Name: workflow_definities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_definities (
    id integer NOT NULL,
    naam text NOT NULL,
    type text NOT NULL,
    omschrijving text,
    actief boolean DEFAULT true NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_definities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_definities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_definities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_definities_id_seq OWNED BY public.workflow_definities.id;


--
-- Name: workflow_lanes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_lanes (
    id integer NOT NULL,
    workflow_id integer NOT NULL,
    naam text NOT NULL,
    kleur text DEFAULT '#64748b'::text NOT NULL,
    volgorde integer DEFAULT 0 NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_lanes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_lanes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_lanes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_lanes_id_seq OWNED BY public.workflow_lanes.id;


--
-- Name: workflow_rechten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_rechten (
    id integer NOT NULL,
    module_id text NOT NULL,
    workflow_status text NOT NULL,
    rol_filter text,
    min_niveau_vereist integer DEFAULT 1 NOT NULL,
    beschrijving text,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_rechten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_rechten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_rechten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_rechten_id_seq OWNED BY public.workflow_rechten.id;


--
-- Name: workflow_transitie_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_transitie_log (
    id integer NOT NULL,
    workflow_id text NOT NULL,
    entity_id integer NOT NULL,
    entity_type text NOT NULL,
    van_status text NOT NULL,
    naar_status text NOT NULL,
    gebruiker_id integer,
    gebruiker_naam text,
    reden text,
    metadata jsonb,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: workflow_transitie_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_transitie_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_transitie_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_transitie_log_id_seq OWNED BY public.workflow_transitie_log.id;


--
-- Name: ziekmeldingen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ziekmeldingen (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    start_datum text NOT NULL,
    eind_datum text,
    reden text,
    omschrijving text,
    status text DEFAULT 'gemeld'::text NOT NULL,
    gemeld_door_id integer,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ziekmeldingen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ziekmeldingen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ziekmeldingen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ziekmeldingen_id_seq OWNED BY public.ziekmeldingen.id;


--
-- Name: zzp_overeenkomsten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zzp_overeenkomsten (
    id integer NOT NULL,
    medewerker_id integer NOT NULL,
    aangemaakt_door_id integer,
    opdracht_omschrijving text NOT NULL,
    specifieke_taken text,
    projectnummer text,
    start_datum text NOT NULL,
    eind_datum text NOT NULL,
    uurtarief real,
    vaste_prijs real,
    betalingswijze text DEFAULT 'factuur_achteraf'::text NOT NULL,
    zzp_bedrijfsnaam text,
    zzp_kvk text,
    zzp_btw text,
    status text DEFAULT 'concept'::text NOT NULL,
    handtekening_fps_datum text,
    handtekening_zzp_datum text,
    ondertekend_door_id integer,
    ai_ingevuld boolean DEFAULT false NOT NULL,
    aangemaakt_op timestamp without time zone DEFAULT now() NOT NULL,
    bijgewerkt_op timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: zzp_overeenkomsten_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zzp_overeenkomsten_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zzp_overeenkomsten_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zzp_overeenkomsten_id_seq OWNED BY public.zzp_overeenkomsten.id;


--
-- Name: aanvraag_planningen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_planningen ALTER COLUMN id SET DEFAULT nextval('public.aanvraag_planningen_id_seq'::regclass);


--
-- Name: aanvraag_voorstellen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_voorstellen ALTER COLUMN id SET DEFAULT nextval('public.aanvraag_voorstellen_id_seq'::regclass);


--
-- Name: abonnementen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abonnementen ALTER COLUMN id SET DEFAULT nextval('public.abonnementen_id_seq'::regclass);


--
-- Name: accountview_export_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_export_logs ALTER COLUMN id SET DEFAULT nextval('public.accountview_export_logs_id_seq'::regclass);


--
-- Name: accountview_instellingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_instellingen ALTER COLUMN id SET DEFAULT nextval('public.accountview_instellingen_id_seq'::regclass);


--
-- Name: accountview_project_mapping id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_project_mapping ALTER COLUMN id SET DEFAULT nextval('public.accountview_project_mapping_id_seq'::regclass);


--
-- Name: accountview_relatie_mapping id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_relatie_mapping ALTER COLUMN id SET DEFAULT nextval('public.accountview_relatie_mapping_id_seq'::regclass);


--
-- Name: activiteiten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activiteiten ALTER COLUMN id SET DEFAULT nextval('public.activiteiten_id_seq'::regclass);


--
-- Name: ai_aanroepen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_aanroepen ALTER COLUMN id SET DEFAULT nextval('public.ai_aanroepen_id_seq'::regclass);


--
-- Name: ai_beslissingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_beslissingen ALTER COLUMN id SET DEFAULT nextval('public.ai_beslissingen_id_seq'::regclass);


--
-- Name: ai_categorie_correcties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_categorie_correcties ALTER COLUMN id SET DEFAULT nextval('public.ai_categorie_correcties_id_seq'::regclass);


--
-- Name: ai_prompt_scans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_scans ALTER COLUMN id SET DEFAULT nextval('public.ai_prompt_scans_id_seq'::regclass);


--
-- Name: ai_veld_correcties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_veld_correcties ALTER COLUMN id SET DEFAULT nextval('public.ai_veld_correcties_id_seq'::regclass);


--
-- Name: ai_wijzigingsvoorstellen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_wijzigingsvoorstellen ALTER COLUMN id SET DEFAULT nextval('public.ai_wijzigingsvoorstellen_id_seq'::regclass);


--
-- Name: app_instellingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_instellingen ALTER COLUMN id SET DEFAULT nextval('public.app_instellingen_id_seq'::regclass);


--
-- Name: arbeidsovereenkomsten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arbeidsovereenkomsten ALTER COLUMN id SET DEFAULT nextval('public.arbeidsovereenkomsten_id_seq'::regclass);


--
-- Name: artikelen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artikelen ALTER COLUMN id SET DEFAULT nextval('public.artikelen_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: avg_inzageverzoeken id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avg_inzageverzoeken ALTER COLUMN id SET DEFAULT nextval('public.avg_inzageverzoeken_id_seq'::regclass);


--
-- Name: avg_opschoon_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avg_opschoon_log ALTER COLUMN id SET DEFAULT nextval('public.avg_opschoon_log_id_seq'::regclass);


--
-- Name: avg_verwerkers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avg_verwerkers ALTER COLUMN id SET DEFAULT nextval('public.avg_verwerkers_id_seq'::regclass);


--
-- Name: backup_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_records ALTER COLUMN id SET DEFAULT nextval('public.backup_records_id_seq'::regclass);


--
-- Name: bedrijfssluitingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bedrijfssluitingen ALTER COLUMN id SET DEFAULT nextval('public.bedrijfssluitingen_id_seq'::regclass);


--
-- Name: bekwaamheden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bekwaamheden ALTER COLUMN id SET DEFAULT nextval('public.bekwaamheden_id_seq'::regclass);


--
-- Name: boekhouder_uploads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boekhouder_uploads ALTER COLUMN id SET DEFAULT nextval('public.boekhouder_uploads_id_seq'::regclass);


--
-- Name: brandstof_importen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_importen ALTER COLUMN id SET DEFAULT nextval('public.brandstof_importen_id_seq'::regclass);


--
-- Name: brandstof_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_regels ALTER COLUMN id SET DEFAULT nextval('public.brandstof_regels_id_seq'::regclass);


--
-- Name: bruikleen_overeenkomsten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bruikleen_overeenkomsten ALTER COLUMN id SET DEFAULT nextval('public.bruikleen_overeenkomsten_id_seq'::regclass);


--
-- Name: calculatie_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calculatie_regels ALTER COLUMN id SET DEFAULT nextval('public.calculatie_regels_id_seq'::regclass);


--
-- Name: calculaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calculaties ALTER COLUMN id SET DEFAULT nextval('public.calculaties_id_seq'::regclass);


--
-- Name: chat_berichten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_berichten ALTER COLUMN id SET DEFAULT nextval('public.chat_berichten_id_seq'::regclass);


--
-- Name: chat_deelnemers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_deelnemers ALTER COLUMN id SET DEFAULT nextval('public.chat_deelnemers_id_seq'::regclass);


--
-- Name: chat_gesprekken id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_gesprekken ALTER COLUMN id SET DEFAULT nextval('public.chat_gesprekken_id_seq'::regclass);


--
-- Name: clusters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clusters ALTER COLUMN id SET DEFAULT nextval('public.clusters_id_seq'::regclass);


--
-- Name: compliance_signalen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_signalen ALTER COLUMN id SET DEFAULT nextval('public.compliance_signalen_id_seq'::regclass);


--
-- Name: constructie_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.constructie_templates ALTER COLUMN id SET DEFAULT nextval('public.constructie_templates_id_seq'::regclass);


--
-- Name: contract_besluiten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_besluiten ALTER COLUMN id SET DEFAULT nextval('public.contract_besluiten_id_seq'::regclass);


--
-- Name: contract_signaleringen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_signaleringen ALTER COLUMN id SET DEFAULT nextval('public.contract_signaleringen_id_seq'::regclass);


--
-- Name: cqo_bevindingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cqo_bevindingen ALTER COLUMN id SET DEFAULT nextval('public.cqo_bevindingen_id_seq'::regclass);


--
-- Name: cqo_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cqo_runs ALTER COLUMN id SET DEFAULT nextval('public.cqo_runs_id_seq'::regclass);


--
-- Name: cqo_verbeterpunten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cqo_verbeterpunten ALTER COLUMN id SET DEFAULT nextval('public.cqo_verbeterpunten_id_seq'::regclass);


--
-- Name: crm_commercieel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_commercieel ALTER COLUMN id SET DEFAULT nextval('public.crm_commercieel_id_seq'::regclass);


--
-- Name: crm_communicatie id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communicatie ALTER COLUMN id SET DEFAULT nextval('public.crm_communicatie_id_seq'::regclass);


--
-- Name: crm_concurrenten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_concurrenten ALTER COLUMN id SET DEFAULT nextval('public.crm_concurrenten_id_seq'::regclass);


--
-- Name: crm_contactpersonen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contactpersonen ALTER COLUMN id SET DEFAULT nextval('public.crm_contactpersonen_id_seq'::regclass);


--
-- Name: crm_financieel id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_financieel ALTER COLUMN id SET DEFAULT nextval('public.crm_financieel_id_seq'::regclass);


--
-- Name: crm_klanten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_klanten ALTER COLUMN id SET DEFAULT nextval('public.crm_klanten_id_seq'::regclass);


--
-- Name: crm_marktintelligentie id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marktintelligentie ALTER COLUMN id SET DEFAULT nextval('public.crm_marktintelligentie_id_seq'::regclass);


--
-- Name: crm_opdrachten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_opdrachten ALTER COLUMN id SET DEFAULT nextval('public.crm_opdrachten_id_seq'::regclass);


--
-- Name: crm_relatievoorstellen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_relatievoorstellen ALTER COLUMN id SET DEFAULT nextval('public.crm_relatievoorstellen_id_seq'::regclass);


--
-- Name: crm_scout_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_scout_runs ALTER COLUMN id SET DEFAULT nextval('public.crm_scout_runs_id_seq'::regclass);


--
-- Name: crm_taken id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_taken ALTER COLUMN id SET DEFAULT nextval('public.crm_taken_id_seq'::regclass);


--
-- Name: declaratie_beleid id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaratie_beleid ALTER COLUMN id SET DEFAULT nextval('public.declaratie_beleid_id_seq'::regclass);


--
-- Name: declaraties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraties ALTER COLUMN id SET DEFAULT nextval('public.declaraties_id_seq'::regclass);


--
-- Name: document_classificatie_correcties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_classificatie_correcties ALTER COLUMN id SET DEFAULT nextval('public.document_classificatie_correcties_id_seq'::regclass);


--
-- Name: document_goedkeuringen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_goedkeuringen ALTER COLUMN id SET DEFAULT nextval('public.document_goedkeuringen_id_seq'::regclass);


--
-- Name: document_koppelingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_koppelingen ALTER COLUMN id SET DEFAULT nextval('public.document_koppelingen_id_seq'::regclass);


--
-- Name: document_logboek id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_logboek ALTER COLUMN id SET DEFAULT nextval('public.document_logboek_id_seq'::regclass);


--
-- Name: document_studio_modellen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_studio_modellen ALTER COLUMN id SET DEFAULT nextval('public.document_studio_modellen_id_seq'::regclass);


--
-- Name: document_toepassingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_toepassingen ALTER COLUMN id SET DEFAULT nextval('public.document_toepassingen_id_seq'::regclass);


--
-- Name: documenten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documenten ALTER COLUMN id SET DEFAULT nextval('public.documenten_id_seq'::regclass);


--
-- Name: dossier_documenten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_documenten ALTER COLUMN id SET DEFAULT nextval('public.dossier_documenten_id_seq'::regclass);


--
-- Name: dossiers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers ALTER COLUMN id SET DEFAULT nextval('public.dossiers_id_seq'::regclass);


--
-- Name: eenheidsprijzen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eenheidsprijzen ALTER COLUMN id SET DEFAULT nextval('public.eenheidsprijzen_id_seq'::regclass);


--
-- Name: fabrikanten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fabrikanten ALTER COLUMN id SET DEFAULT nextval('public.fabrikanten_id_seq'::regclass);


--
-- Name: facturen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen ALTER COLUMN id SET DEFAULT nextval('public.facturen_id_seq'::regclass);


--
-- Name: factuur_correspondentie id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_correspondentie ALTER COLUMN id SET DEFAULT nextval('public.factuur_correspondentie_id_seq'::regclass);


--
-- Name: factuur_herinneringen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_herinneringen ALTER COLUMN id SET DEFAULT nextval('public.factuur_herinneringen_id_seq'::regclass);


--
-- Name: factuur_import_instellingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_import_instellingen ALTER COLUMN id SET DEFAULT nextval('public.factuur_import_instellingen_id_seq'::regclass);


--
-- Name: factuur_import_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_import_log ALTER COLUMN id SET DEFAULT nextval('public.factuur_import_log_id_seq'::regclass);


--
-- Name: factuur_opmerkingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_opmerkingen ALTER COLUMN id SET DEFAULT nextval('public.factuur_opmerkingen_id_seq'::regclass);


--
-- Name: factuur_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_regels ALTER COLUMN id SET DEFAULT nextval('public.factuur_regels_id_seq'::regclass);


--
-- Name: factuur_signalen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_signalen ALTER COLUMN id SET DEFAULT nextval('public.factuur_signalen_id_seq'::regclass);


--
-- Name: factuur_termijnen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_termijnen ALTER COLUMN id SET DEFAULT nextval('public.factuur_termijnen_id_seq'::regclass);


--
-- Name: factuur_tijdlijn id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_tijdlijn ALTER COLUMN id SET DEFAULT nextval('public.factuur_tijdlijn_id_seq'::regclass);


--
-- Name: feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback ALTER COLUMN id SET DEFAULT nextval('public.feedback_id_seq'::regclass);


--
-- Name: feestdagen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feestdagen ALTER COLUMN id SET DEFAULT nextval('public.feestdagen_id_seq'::regclass);


--
-- Name: fie_ak_posten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_ak_posten ALTER COLUMN id SET DEFAULT nextval('public.fie_ak_posten_id_seq'::regclass);


--
-- Name: fie_capaciteit_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_capaciteit_snapshots ALTER COLUMN id SET DEFAULT nextval('public.fie_capaciteit_snapshots_id_seq'::regclass);


--
-- Name: fie_jaarbegrotingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_jaarbegrotingen ALTER COLUMN id SET DEFAULT nextval('public.fie_jaarbegrotingen_id_seq'::regclass);


--
-- Name: fie_leermomenten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_leermomenten ALTER COLUMN id SET DEFAULT nextval('public.fie_leermomenten_id_seq'::regclass);


--
-- Name: fie_nacalculaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_nacalculaties ALTER COLUMN id SET DEFAULT nextval('public.fie_nacalculaties_id_seq'::regclass);


--
-- Name: fie_observaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_observaties ALTER COLUMN id SET DEFAULT nextval('public.fie_observaties_id_seq'::regclass);


--
-- Name: financiele_contract_kosten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_kosten ALTER COLUMN id SET DEFAULT nextval('public.financiele_contract_kosten_id_seq'::regclass);


--
-- Name: financiele_contract_signaleringen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_signaleringen ALTER COLUMN id SET DEFAULT nextval('public.financiele_contract_signaleringen_id_seq'::regclass);


--
-- Name: financiele_contracten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contracten ALTER COLUMN id SET DEFAULT nextval('public.financiele_contracten_id_seq'::regclass);


--
-- Name: financiele_document_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_document_log ALTER COLUMN id SET DEFAULT nextval('public.financiele_document_log_id_seq'::regclass);


--
-- Name: financiele_documenten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_documenten ALTER COLUMN id SET DEFAULT nextval('public.financiele_documenten_id_seq'::regclass);


--
-- Name: financiele_kerncijfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_kerncijfers ALTER COLUMN id SET DEFAULT nextval('public.financiele_kerncijfers_id_seq'::regclass);


--
-- Name: fotos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos ALTER COLUMN id SET DEFAULT nextval('public.fotos_id_seq'::regclass);


--
-- Name: fps_bedrijfsstandaarden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_bedrijfsstandaarden ALTER COLUMN id SET DEFAULT nextval('public.fps_bedrijfsstandaarden_id_seq'::regclass);


--
-- Name: fps_visual_annotaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_visual_annotaties ALTER COLUMN id SET DEFAULT nextval('public.fps_visual_annotaties_id_seq'::regclass);


--
-- Name: fps_visuals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_visuals ALTER COLUMN id SET DEFAULT nextval('public.fps_visuals_id_seq'::regclass);


--
-- Name: functie_opleidingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.functie_opleidingen ALTER COLUMN id SET DEFAULT nextval('public.functie_opleidingen_id_seq'::regclass);


--
-- Name: functies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.functies ALTER COLUMN id SET DEFAULT nextval('public.functies_id_seq'::regclass);


--
-- Name: gebouw_email_bijlagen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_email_bijlagen ALTER COLUMN id SET DEFAULT nextval('public.gebouw_email_bijlagen_id_seq'::regclass);


--
-- Name: gebouw_email_samenvattingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_email_samenvattingen ALTER COLUMN id SET DEFAULT nextval('public.gebouw_email_samenvattingen_id_seq'::regclass);


--
-- Name: gebouw_emails id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_emails ALTER COLUMN id SET DEFAULT nextval('public.gebouw_emails_id_seq'::regclass);


--
-- Name: gebouw_partijen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_partijen ALTER COLUMN id SET DEFAULT nextval('public.gebouw_partijen_id_seq'::regclass);


--
-- Name: gebouw_publicaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_publicaties ALTER COLUMN id SET DEFAULT nextval('public.gebouw_publicaties_id_seq'::regclass);


--
-- Name: gebouw_toewijzingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_toewijzingen ALTER COLUMN id SET DEFAULT nextval('public.gebouw_toewijzingen_id_seq'::regclass);


--
-- Name: gebouwen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouwen ALTER COLUMN id SET DEFAULT nextval('public.gebouwen_id_seq'::regclass);


--
-- Name: gebruiker_profielen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruiker_profielen ALTER COLUMN id SET DEFAULT nextval('public.gebruiker_profielen_id_seq'::regclass);


--
-- Name: gebruikers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruikers ALTER COLUMN id SET DEFAULT nextval('public.gebruikers_id_seq'::regclass);


--
-- Name: gebruikers_meldingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruikers_meldingen ALTER COLUMN id SET DEFAULT nextval('public.gebruikers_meldingen_id_seq'::regclass);


--
-- Name: gereedschap_meldingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschap_meldingen ALTER COLUMN id SET DEFAULT nextval('public.gereedschap_meldingen_id_seq'::regclass);


--
-- Name: gereedschappen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschappen ALTER COLUMN id SET DEFAULT nextval('public.gereedschappen_id_seq'::regclass);


--
-- Name: go_live_adviezen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.go_live_adviezen ALTER COLUMN id SET DEFAULT nextval('public.go_live_adviezen_id_seq'::regclass);


--
-- Name: go_live_fasen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.go_live_fasen ALTER COLUMN id SET DEFAULT nextval('public.go_live_fasen_id_seq'::regclass);


--
-- Name: go_live_lessen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.go_live_lessen ALTER COLUMN id SET DEFAULT nextval('public.go_live_lessen_id_seq'::regclass);


--
-- Name: goedkeuring_aanvragen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_aanvragen ALTER COLUMN id SET DEFAULT nextval('public.goedkeuring_aanvragen_id_seq'::regclass);


--
-- Name: goedkeuring_beleidsregels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_beleidsregels ALTER COLUMN id SET DEFAULT nextval('public.goedkeuring_beleidsregels_id_seq'::regclass);


--
-- Name: goedkeuring_escalaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_escalaties ALTER COLUMN id SET DEFAULT nextval('public.goedkeuring_escalaties_id_seq'::regclass);


--
-- Name: goedkeuring_stappen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_stappen ALTER COLUMN id SET DEFAULT nextval('public.goedkeuring_stappen_id_seq'::regclass);


--
-- Name: governance_checks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_checks ALTER COLUMN id SET DEFAULT nextval('public.governance_checks_id_seq'::regclass);


--
-- Name: governance_wachtrij id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_wachtrij ALTER COLUMN id SET DEFAULT nextval('public.governance_wachtrij_id_seq'::regclass);


--
-- Name: helpdesk_tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.helpdesk_tickets ALTER COLUMN id SET DEFAULT nextval('public.helpdesk_tickets_id_seq'::regclass);


--
-- Name: hrm_ai_voorstellen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_ai_voorstellen ALTER COLUMN id SET DEFAULT nextval('public.hrm_ai_voorstellen_id_seq'::regclass);


--
-- Name: hrm_middelen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_middelen ALTER COLUMN id SET DEFAULT nextval('public.hrm_middelen_id_seq'::regclass);


--
-- Name: hrm_onboarding_taken id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_onboarding_taken ALTER COLUMN id SET DEFAULT nextval('public.hrm_onboarding_taken_id_seq'::regclass);


--
-- Name: import_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs ALTER COLUMN id SET DEFAULT nextval('public.import_logs_id_seq'::regclass);


--
-- Name: inbox_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_audit_log ALTER COLUMN id SET DEFAULT nextval('public.inbox_audit_log_id_seq'::regclass);


--
-- Name: inbox_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_items ALTER COLUMN id SET DEFAULT nextval('public.inbox_items_id_seq'::regclass);


--
-- Name: inkoopbon_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbon_regels ALTER COLUMN id SET DEFAULT nextval('public.inkoopbon_regels_id_seq'::regclass);


--
-- Name: inkoopbonnen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbonnen ALTER COLUMN id SET DEFAULT nextval('public.inkoopbonnen_id_seq'::regclass);


--
-- Name: inkoopplan_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopplan_regels ALTER COLUMN id SET DEFAULT nextval('public.inkoopplan_regels_id_seq'::regclass);


--
-- Name: inkoopplannen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopplannen ALTER COLUMN id SET DEFAULT nextval('public.inkoopplannen_id_seq'::regclass);


--
-- Name: inspectie_bevindingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspectie_bevindingen ALTER COLUMN id SET DEFAULT nextval('public.inspectie_bevindingen_id_seq'::regclass);


--
-- Name: inspecties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspecties ALTER COLUMN id SET DEFAULT nextval('public.inspecties_id_seq'::regclass);


--
-- Name: jaarafsluiting_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jaarafsluiting_regels ALTER COLUMN id SET DEFAULT nextval('public.jaarafsluiting_regels_id_seq'::regclass);


--
-- Name: kantoor_releases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kantoor_releases ALTER COLUMN id SET DEFAULT nextval('public.kantoor_releases_id_seq'::regclass);


--
-- Name: label_applicaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label_applicaties ALTER COLUMN id SET DEFAULT nextval('public.label_applicaties_id_seq'::regclass);


--
-- Name: labels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels ALTER COLUMN id SET DEFAULT nextval('public.labels_id_seq'::regclass);


--
-- Name: leesbevestigingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leesbevestigingen ALTER COLUMN id SET DEFAULT nextval('public.leesbevestigingen_id_seq'::regclass);


--
-- Name: leverancier_categorisatie id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leverancier_categorisatie ALTER COLUMN id SET DEFAULT nextval('public.leverancier_categorisatie_id_seq'::regclass);


--
-- Name: leverancier_prestaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leverancier_prestaties ALTER COLUMN id SET DEFAULT nextval('public.leverancier_prestaties_id_seq'::regclass);


--
-- Name: leveranciers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leveranciers ALTER COLUMN id SET DEFAULT nextval('public.leveranciers_id_seq'::regclass);


--
-- Name: login_pogingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_pogingen ALTER COLUMN id SET DEFAULT nextval('public.login_pogingen_id_seq'::regclass);


--
-- Name: loon_output_bestanden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loon_output_bestanden ALTER COLUMN id SET DEFAULT nextval('public.loon_output_bestanden_id_seq'::regclass);


--
-- Name: magazijn_inkooporder_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_inkooporder_regels ALTER COLUMN id SET DEFAULT nextval('public.magazijn_inkooporder_regels_id_seq'::regclass);


--
-- Name: magazijn_inkooporders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_inkooporders ALTER COLUMN id SET DEFAULT nextval('public.magazijn_inkooporders_id_seq'::regclass);


--
-- Name: magazijn_locaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_locaties ALTER COLUMN id SET DEFAULT nextval('public.magazijn_locaties_id_seq'::regclass);


--
-- Name: magazijn_picklijst_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijst_regels ALTER COLUMN id SET DEFAULT nextval('public.magazijn_picklijst_regels_id_seq'::regclass);


--
-- Name: magazijn_picklijsten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijsten ALTER COLUMN id SET DEFAULT nextval('public.magazijn_picklijsten_id_seq'::regclass);


--
-- Name: magazijn_snoozes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_snoozes ALTER COLUMN id SET DEFAULT nextval('public.magazijn_snoozes_id_seq'::regclass);


--
-- Name: magazijn_stellingscans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_stellingscans ALTER COLUMN id SET DEFAULT nextval('public.magazijn_stellingscans_id_seq'::regclass);


--
-- Name: mail_logboek id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_logboek ALTER COLUMN id SET DEFAULT nextval('public.mail_logboek_id_seq'::regclass);


--
-- Name: materiaal_aanvragen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiaal_aanvragen ALTER COLUMN id SET DEFAULT nextval('public.materiaal_aanvragen_id_seq'::regclass);


--
-- Name: medewerker_aanstellingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_aanstellingen ALTER COLUMN id SET DEFAULT nextval('public.medewerker_aanstellingen_id_seq'::regclass);


--
-- Name: medewerker_cao_keuzes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_cao_keuzes ALTER COLUMN id SET DEFAULT nextval('public.medewerker_cao_keuzes_id_seq'::regclass);


--
-- Name: medewerker_documenten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_documenten ALTER COLUMN id SET DEFAULT nextval('public.medewerker_documenten_id_seq'::regclass);


--
-- Name: medewerker_opleidingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_opleidingen ALTER COLUMN id SET DEFAULT nextval('public.medewerker_opleidingen_id_seq'::regclass);


--
-- Name: medewerkers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerkers ALTER COLUMN id SET DEFAULT nextval('public.medewerkers_id_seq'::regclass);


--
-- Name: mod_calc_adviezen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_adviezen ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_adviezen_id_seq'::regclass);


--
-- Name: mod_calc_artikelen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_artikelen ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_artikelen_id_seq'::regclass);


--
-- Name: mod_calc_bronbestanden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_bronbestanden ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_bronbestanden_id_seq'::regclass);


--
-- Name: mod_calc_eenheden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_eenheden ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_eenheden_id_seq'::regclass);


--
-- Name: mod_calc_headers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_headers ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_headers_id_seq'::regclass);


--
-- Name: mod_calc_inkoop_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_inkoop_items ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_inkoop_items_id_seq'::regclass);


--
-- Name: mod_calc_leveranciers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_leveranciers ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_leveranciers_id_seq'::regclass);


--
-- Name: mod_calc_normtijden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_normtijden ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_normtijden_id_seq'::regclass);


--
-- Name: mod_calc_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_regels ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_regels_id_seq'::regclass);


--
-- Name: mod_calc_tarieven id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_tarieven ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_tarieven_id_seq'::regclass);


--
-- Name: mod_calc_versies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_versies ALTER COLUMN id SET DEFAULT nextval('public.mod_calc_versies_id_seq'::regclass);


--
-- Name: module_beoordelingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_beoordelingen ALTER COLUMN id SET DEFAULT nextval('public.module_beoordelingen_id_seq'::regclass);


--
-- Name: monteur_achievements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monteur_achievements ALTER COLUMN id SET DEFAULT nextval('public.monteur_achievements_id_seq'::regclass);


--
-- Name: muis_gebeurtenissen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muis_gebeurtenissen ALTER COLUMN id SET DEFAULT nextval('public.muis_gebeurtenissen_id_seq'::regclass);


--
-- Name: object_rechten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_rechten ALTER COLUMN id SET DEFAULT nextval('public.object_rechten_id_seq'::regclass);


--
-- Name: offerte_bijlagen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_bijlagen ALTER COLUMN id SET DEFAULT nextval('public.offerte_bijlagen_id_seq'::regclass);


--
-- Name: offerte_contract_adviezen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_contract_adviezen ALTER COLUMN id SET DEFAULT nextval('public.offerte_contract_adviezen_id_seq'::regclass);


--
-- Name: offerte_email_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_email_log ALTER COLUMN id SET DEFAULT nextval('public.offerte_email_log_id_seq'::regclass);


--
-- Name: offerte_handtekeningen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_handtekeningen ALTER COLUMN id SET DEFAULT nextval('public.offerte_handtekeningen_id_seq'::regclass);


--
-- Name: offerte_hoofdstukken id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_hoofdstukken ALTER COLUMN id SET DEFAULT nextval('public.offerte_hoofdstukken_id_seq'::regclass);


--
-- Name: offerte_klant_contracten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_klant_contracten ALTER COLUMN id SET DEFAULT nextval('public.offerte_klant_contracten_id_seq'::regclass);


--
-- Name: offerte_portaal_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_portaal_tokens ALTER COLUMN id SET DEFAULT nextval('public.offerte_portaal_tokens_id_seq'::regclass);


--
-- Name: offerte_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_regels ALTER COLUMN id SET DEFAULT nextval('public.offerte_regels_id_seq'::regclass);


--
-- Name: offerte_secties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_secties ALTER COLUMN id SET DEFAULT nextval('public.offerte_secties_id_seq'::regclass);


--
-- Name: offerte_sjablonen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_sjablonen ALTER COLUMN id SET DEFAULT nextval('public.offerte_sjablonen_id_seq'::regclass);


--
-- Name: offerte_tracking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_tracking ALTER COLUMN id SET DEFAULT nextval('public.offerte_tracking_id_seq'::regclass);


--
-- Name: offerte_uitgangspunten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_uitgangspunten ALTER COLUMN id SET DEFAULT nextval('public.offerte_uitgangspunten_id_seq'::regclass);


--
-- Name: offerte_versies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_versies ALTER COLUMN id SET DEFAULT nextval('public.offerte_versies_id_seq'::regclass);


--
-- Name: offerte_voorwaarden_sets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_voorwaarden_sets ALTER COLUMN id SET DEFAULT nextval('public.offerte_voorwaarden_sets_id_seq'::regclass);


--
-- Name: offerte_vragen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_vragen ALTER COLUMN id SET DEFAULT nextval('public.offerte_vragen_id_seq'::regclass);


--
-- Name: offertes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes ALTER COLUMN id SET DEFAULT nextval('public.offertes_id_seq'::regclass);


--
-- Name: onderaannemer_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderaannemer_orders ALTER COLUMN id SET DEFAULT nextval('public.onderaannemer_orders_id_seq'::regclass);


--
-- Name: onderhanden_werk_overrides id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhanden_werk_overrides ALTER COLUMN id SET DEFAULT nextval('public.onderhanden_werk_overrides_id_seq'::regclass);


--
-- Name: onderhoud id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoud ALTER COLUMN id SET DEFAULT nextval('public.onderhoud_id_seq'::regclass);


--
-- Name: onderhoudscontracten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoudscontracten ALTER COLUMN id SET DEFAULT nextval('public.onderhoudscontracten_id_seq'::regclass);


--
-- Name: opdrachten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachten ALTER COLUMN id SET DEFAULT nextval('public.opdrachten_id_seq'::regclass);


--
-- Name: opdrachtgever_voorkeuren id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachtgever_voorkeuren ALTER COLUMN id SET DEFAULT nextval('public.opdrachtgever_voorkeuren_id_seq'::regclass);


--
-- Name: opleidingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opleidingen ALTER COLUMN id SET DEFAULT nextval('public.opleidingen_id_seq'::regclass);


--
-- Name: opleverrapporten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opleverrapporten ALTER COLUMN id SET DEFAULT nextval('public.opleverrapporten_id_seq'::regclass);


--
-- Name: opname_fotos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_fotos ALTER COLUMN id SET DEFAULT nextval('public.opname_fotos_id_seq'::regclass);


--
-- Name: opname_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_items ALTER COLUMN id SET DEFAULT nextval('public.opname_items_id_seq'::regclass);


--
-- Name: opnames id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opnames ALTER COLUMN id SET DEFAULT nextval('public.opnames_id_seq'::regclass);


--
-- Name: org_bedrijfsdocumenten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bedrijfsdocumenten ALTER COLUMN id SET DEFAULT nextval('public.org_bedrijfsdocumenten_id_seq'::regclass);


--
-- Name: org_jaarverslagen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_jaarverslagen ALTER COLUMN id SET DEFAULT nextval('public.org_jaarverslagen_id_seq'::regclass);


--
-- Name: org_verzekeringen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_verzekeringen ALTER COLUMN id SET DEFAULT nextval('public.org_verzekeringen_id_seq'::regclass);


--
-- Name: pbm_inspecties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_inspecties ALTER COLUMN id SET DEFAULT nextval('public.pbm_inspecties_id_seq'::regclass);


--
-- Name: pbm_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_items ALTER COLUMN id SET DEFAULT nextval('public.pbm_items_id_seq'::regclass);


--
-- Name: pim_foto_analyses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_foto_analyses ALTER COLUMN id SET DEFAULT nextval('public.pim_foto_analyses_id_seq'::regclass);


--
-- Name: pim_modellen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_modellen ALTER COLUMN id SET DEFAULT nextval('public.pim_modellen_id_seq'::regclass);


--
-- Name: pim_uitvoering_stappen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_uitvoering_stappen ALTER COLUMN id SET DEFAULT nextval('public.pim_uitvoering_stappen_id_seq'::regclass);


--
-- Name: planning_afwezigheid id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_afwezigheid ALTER COLUMN id SET DEFAULT nextval('public.planning_afwezigheid_id_seq'::regclass);


--
-- Name: planning_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items ALTER COLUMN id SET DEFAULT nextval('public.planning_items_id_seq'::regclass);


--
-- Name: planning_meerwerk id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_meerwerk ALTER COLUMN id SET DEFAULT nextval('public.planning_meerwerk_id_seq'::regclass);


--
-- Name: poortwachter_dossiers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_dossiers ALTER COLUMN id SET DEFAULT nextval('public.poortwachter_dossiers_id_seq'::regclass);


--
-- Name: poortwachter_mijlpalen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_mijlpalen ALTER COLUMN id SET DEFAULT nextval('public.poortwachter_mijlpalen_id_seq'::regclass);


--
-- Name: profielen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profielen ALTER COLUMN id SET DEFAULT nextval('public.profielen_id_seq'::regclass);


--
-- Name: project_begrotingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_begrotingen ALTER COLUMN id SET DEFAULT nextval('public.project_begrotingen_id_seq'::regclass);


--
-- Name: projecten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projecten ALTER COLUMN id SET DEFAULT nextval('public.projecten_id_seq'::regclass);


--
-- Name: push_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens ALTER COLUMN id SET DEFAULT nextval('public.push_tokens_id_seq'::regclass);


--
-- Name: regie_begroting id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_begroting ALTER COLUMN id SET DEFAULT nextval('public.regie_begroting_id_seq'::regclass);


--
-- Name: regie_materialen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_materialen ALTER COLUMN id SET DEFAULT nextval('public.regie_materialen_id_seq'::regclass);


--
-- Name: regie_tarieven id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_tarieven ALTER COLUMN id SET DEFAULT nextval('public.regie_tarieven_id_seq'::regclass);


--
-- Name: regie_voorwaarden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_voorwaarden ALTER COLUMN id SET DEFAULT nextval('public.regie_voorwaarden_id_seq'::regclass);


--
-- Name: release_update_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_update_notes ALTER COLUMN id SET DEFAULT nextval('public.release_update_notes_id_seq'::regclass);


--
-- Name: reserveringen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserveringen ALTER COLUMN id SET DEFAULT nextval('public.reserveringen_id_seq'::regclass);


--
-- Name: salaris_audit_ext id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaris_audit_ext ALTER COLUMN id SET DEFAULT nextval('public.salaris_audit_ext_id_seq'::regclass);


--
-- Name: salaris_mutaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaris_mutaties ALTER COLUMN id SET DEFAULT nextval('public.salaris_mutaties_id_seq'::regclass);


--
-- Name: salarisbatches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbatches ALTER COLUMN id SET DEFAULT nextval('public.salarisbatches_id_seq'::regclass);


--
-- Name: salarisbestanden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbestanden ALTER COLUMN id SET DEFAULT nextval('public.salarisbestanden_id_seq'::regclass);


--
-- Name: salarisdocument_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisdocument_audit ALTER COLUMN id SET DEFAULT nextval('public.salarisdocument_audit_id_seq'::regclass);


--
-- Name: scab_mail_bijlagen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mail_bijlagen ALTER COLUMN id SET DEFAULT nextval('public.scab_mail_bijlagen_id_seq'::regclass);


--
-- Name: scab_mails id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mails ALTER COLUMN id SET DEFAULT nextval('public.scab_mails_id_seq'::regclass);


--
-- Name: scheidingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheidingen ALTER COLUMN id SET DEFAULT nextval('public.scheidingen_id_seq'::regclass);


--
-- Name: security_instellingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_instellingen ALTER COLUMN id SET DEFAULT nextval('public.security_instellingen_id_seq'::regclass);


--
-- Name: security_intake_scans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_intake_scans ALTER COLUMN id SET DEFAULT nextval('public.security_intake_scans_id_seq'::regclass);


--
-- Name: security_releases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_releases ALTER COLUMN id SET DEFAULT nextval('public.security_releases_id_seq'::regclass);


--
-- Name: security_scan_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_scan_runs ALTER COLUMN id SET DEFAULT nextval('public.security_scan_runs_id_seq'::regclass);


--
-- Name: security_test_resultaten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_test_resultaten ALTER COLUMN id SET DEFAULT nextval('public.security_test_resultaten_id_seq'::regclass);


--
-- Name: sepa_bestanden id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sepa_bestanden ALTER COLUMN id SET DEFAULT nextval('public.sepa_bestanden_id_seq'::regclass);


--
-- Name: slim_upload_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slim_upload_log ALTER COLUMN id SET DEFAULT nextval('public.slim_upload_log_id_seq'::regclass);


--
-- Name: snagstream_rapporten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snagstream_rapporten ALTER COLUMN id SET DEFAULT nextval('public.snagstream_rapporten_id_seq'::regclass);


--
-- Name: snagstream_snags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snagstream_snags ALTER COLUMN id SET DEFAULT nextval('public.snagstream_snags_id_seq'::regclass);


--
-- Name: spot_ai_voorstellen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_ai_voorstellen ALTER COLUMN id SET DEFAULT nextval('public.spot_ai_voorstellen_id_seq'::regclass);


--
-- Name: spot_dossiers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_dossiers ALTER COLUMN id SET DEFAULT nextval('public.spot_dossiers_id_seq'::regclass);


--
-- Name: tekeningen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tekeningen ALTER COLUMN id SET DEFAULT nextval('public.tekeningen_id_seq'::regclass);


--
-- Name: testrapporten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testrapporten ALTER COLUMN id SET DEFAULT nextval('public.testrapporten_id_seq'::regclass);


--
-- Name: toolbox_berichten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_berichten ALTER COLUMN id SET DEFAULT nextval('public.toolbox_berichten_id_seq'::regclass);


--
-- Name: toolbox_maand_opdrachten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_maand_opdrachten ALTER COLUMN id SET DEFAULT nextval('public.toolbox_maand_opdrachten_id_seq'::regclass);


--
-- Name: toolbox_maand_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_maand_status ALTER COLUMN id SET DEFAULT nextval('public.toolbox_maand_status_id_seq'::regclass);


--
-- Name: uitvoerder_berichten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoerder_berichten ALTER COLUMN id SET DEFAULT nextval('public.uitvoerder_berichten_id_seq'::regclass);


--
-- Name: uitvoerder_sessies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoerder_sessies ALTER COLUMN id SET DEFAULT nextval('public.uitvoerder_sessies_id_seq'::regclass);


--
-- Name: uitvoeringsplan_taken id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoeringsplan_taken ALTER COLUMN id SET DEFAULT nextval('public.uitvoeringsplan_taken_id_seq'::regclass);


--
-- Name: uitvoeringsplannen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoeringsplannen ALTER COLUMN id SET DEFAULT nextval('public.uitvoeringsplannen_id_seq'::regclass);


--
-- Name: uren_registraties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties ALTER COLUMN id SET DEFAULT nextval('public.uren_registraties_id_seq'::regclass);


--
-- Name: veiligheid_incidenten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_incidenten ALTER COLUMN id SET DEFAULT nextval('public.veiligheid_incidenten_id_seq'::regclass);


--
-- Name: veiligheid_lmras id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_lmras ALTER COLUMN id SET DEFAULT nextval('public.veiligheid_lmras_id_seq'::regclass);


--
-- Name: veiligheid_meldingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen ALTER COLUMN id SET DEFAULT nextval('public.veiligheid_meldingen_id_seq'::regclass);


--
-- Name: veiligheid_meldingen_acties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen_acties ALTER COLUMN id SET DEFAULT nextval('public.veiligheid_meldingen_acties_id_seq'::regclass);


--
-- Name: veiligheid_toolbox_afrondingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolbox_afrondingen ALTER COLUMN id SET DEFAULT nextval('public.veiligheid_toolbox_afrondingen_id_seq'::regclass);


--
-- Name: veiligheid_toolbox_vragen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolbox_vragen ALTER COLUMN id SET DEFAULT nextval('public.veiligheid_toolbox_vragen_id_seq'::regclass);


--
-- Name: veiligheid_toolboxen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolboxen ALTER COLUMN id SET DEFAULT nextval('public.veiligheid_toolboxen_id_seq'::regclass);


--
-- Name: veiligheidsmiddel_inspecties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheidsmiddel_inspecties ALTER COLUMN id SET DEFAULT nextval('public.veiligheidsmiddel_inspecties_id_seq'::regclass);


--
-- Name: veiligheidsmiddelen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheidsmiddelen ALTER COLUMN id SET DEFAULT nextval('public.veiligheidsmiddelen_id_seq'::regclass);


--
-- Name: verdiepingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verdiepingen ALTER COLUMN id SET DEFAULT nextval('public.verdiepingen_id_seq'::regclass);


--
-- Name: verlof_aanvraag_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_aanvraag_log ALTER COLUMN id SET DEFAULT nextval('public.verlof_aanvraag_log_id_seq'::regclass);


--
-- Name: verlof_correcties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_correcties ALTER COLUMN id SET DEFAULT nextval('public.verlof_correcties_id_seq'::regclass);


--
-- Name: verlof_instellingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_instellingen ALTER COLUMN id SET DEFAULT nextval('public.verlof_instellingen_id_seq'::regclass);


--
-- Name: verlof_saldi id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_saldi ALTER COLUMN id SET DEFAULT nextval('public.verlof_saldi_id_seq'::regclass);


--
-- Name: verlofaanvragen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlofaanvragen ALTER COLUMN id SET DEFAULT nextval('public.verlofaanvragen_id_seq'::regclass);


--
-- Name: verlofsoorten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlofsoorten ALTER COLUMN id SET DEFAULT nextval('public.verlofsoorten_id_seq'::regclass);


--
-- Name: vge_effectiviteitslog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vge_effectiviteitslog ALTER COLUMN id SET DEFAULT nextval('public.vge_effectiviteitslog_id_seq'::regclass);


--
-- Name: voertuigen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voertuigen ALTER COLUMN id SET DEFAULT nextval('public.voertuigen_id_seq'::regclass);


--
-- Name: voorraad id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad ALTER COLUMN id SET DEFAULT nextval('public.voorraad_id_seq'::regclass);


--
-- Name: voorraad_mutaties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad_mutaties ALTER COLUMN id SET DEFAULT nextval('public.voorraad_mutaties_id_seq'::regclass);


--
-- Name: voorziening_labels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorziening_labels ALTER COLUMN id SET DEFAULT nextval('public.voorziening_labels_id_seq'::regclass);


--
-- Name: voorzieningen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorzieningen ALTER COLUMN id SET DEFAULT nextval('public.voorzieningen_id_seq'::regclass);


--
-- Name: wachtwoord_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wachtwoord_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.wachtwoord_reset_tokens_id_seq'::regclass);


--
-- Name: wagenpark_avg_logboek id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_avg_logboek ALTER COLUMN id SET DEFAULT nextval('public.wagenpark_avg_logboek_id_seq'::regclass);


--
-- Name: wagenpark_kosten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kosten ALTER COLUMN id SET DEFAULT nextval('public.wagenpark_kosten_id_seq'::regclass);


--
-- Name: wagenpark_kwartaalcontrole id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kwartaalcontrole ALTER COLUMN id SET DEFAULT nextval('public.wagenpark_kwartaalcontrole_id_seq'::regclass);


--
-- Name: wagenpark_meldingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_meldingen ALTER COLUMN id SET DEFAULT nextval('public.wagenpark_meldingen_id_seq'::regclass);


--
-- Name: wagenpark_onderhoud id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_onderhoud ALTER COLUMN id SET DEFAULT nextval('public.wagenpark_onderhoud_id_seq'::regclass);


--
-- Name: wagenpark_ritten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_ritten ALTER COLUMN id SET DEFAULT nextval('public.wagenpark_ritten_id_seq'::regclass);


--
-- Name: wagenpark_sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_sync_log ALTER COLUMN id SET DEFAULT nextval('public.wagenpark_sync_log_id_seq'::regclass);


--
-- Name: week_staten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.week_staten ALTER COLUMN id SET DEFAULT nextval('public.week_staten_id_seq'::regclass);


--
-- Name: werk_inbox_koppelingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_koppelingen ALTER COLUMN id SET DEFAULT nextval('public.werk_inbox_koppelingen_id_seq'::regclass);


--
-- Name: werk_inbox_mailboxen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_mailboxen ALTER COLUMN id SET DEFAULT nextval('public.werk_inbox_mailboxen_id_seq'::regclass);


--
-- Name: werk_inbox_mails id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_mails ALTER COLUMN id SET DEFAULT nextval('public.werk_inbox_mails_id_seq'::regclass);


--
-- Name: werk_inbox_notities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_notities ALTER COLUMN id SET DEFAULT nextval('public.werk_inbox_notities_id_seq'::regclass);


--
-- Name: werk_inbox_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_tokens ALTER COLUMN id SET DEFAULT nextval('public.werk_inbox_tokens_id_seq'::regclass);


--
-- Name: werkbegroting_adviezen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbegroting_adviezen ALTER COLUMN id SET DEFAULT nextval('public.werkbegroting_adviezen_id_seq'::regclass);


--
-- Name: werkbegroting_regels id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbegroting_regels ALTER COLUMN id SET DEFAULT nextval('public.werkbegroting_regels_id_seq'::regclass);


--
-- Name: werkbonnen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbonnen ALTER COLUMN id SET DEFAULT nextval('public.werkbonnen_id_seq'::regclass);


--
-- Name: werkgevers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkgevers ALTER COLUMN id SET DEFAULT nextval('public.werkgevers_id_seq'::regclass);


--
-- Name: workflow_cards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_cards ALTER COLUMN id SET DEFAULT nextval('public.workflow_cards_id_seq'::regclass);


--
-- Name: workflow_definities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definities ALTER COLUMN id SET DEFAULT nextval('public.workflow_definities_id_seq'::regclass);


--
-- Name: workflow_lanes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_lanes ALTER COLUMN id SET DEFAULT nextval('public.workflow_lanes_id_seq'::regclass);


--
-- Name: workflow_rechten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_rechten ALTER COLUMN id SET DEFAULT nextval('public.workflow_rechten_id_seq'::regclass);


--
-- Name: workflow_transitie_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitie_log ALTER COLUMN id SET DEFAULT nextval('public.workflow_transitie_log_id_seq'::regclass);


--
-- Name: ziekmeldingen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ziekmeldingen ALTER COLUMN id SET DEFAULT nextval('public.ziekmeldingen_id_seq'::regclass);


--
-- Name: zzp_overeenkomsten id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zzp_overeenkomsten ALTER COLUMN id SET DEFAULT nextval('public.zzp_overeenkomsten_id_seq'::regclass);


--
-- Name: aanvraag_planningen aanvraag_planningen_antwoord_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_planningen
    ADD CONSTRAINT aanvraag_planningen_antwoord_token_unique UNIQUE (antwoord_token);


--
-- Name: aanvraag_planningen aanvraag_planningen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_planningen
    ADD CONSTRAINT aanvraag_planningen_pkey PRIMARY KEY (id);


--
-- Name: aanvraag_voorstellen aanvraag_voorstellen_mail_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_voorstellen
    ADD CONSTRAINT aanvraag_voorstellen_mail_uq UNIQUE (mail_message_id);


--
-- Name: aanvraag_voorstellen aanvraag_voorstellen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_voorstellen
    ADD CONSTRAINT aanvraag_voorstellen_pkey PRIMARY KEY (id);


--
-- Name: abonnementen abonnementen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abonnementen
    ADD CONSTRAINT abonnementen_pkey PRIMARY KEY (id);


--
-- Name: accountview_export_logs accountview_export_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_export_logs
    ADD CONSTRAINT accountview_export_logs_pkey PRIMARY KEY (id);


--
-- Name: accountview_instellingen accountview_instellingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_instellingen
    ADD CONSTRAINT accountview_instellingen_pkey PRIMARY KEY (id);


--
-- Name: accountview_project_mapping accountview_project_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_project_mapping
    ADD CONSTRAINT accountview_project_mapping_pkey PRIMARY KEY (id);


--
-- Name: accountview_relatie_mapping accountview_relatie_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_relatie_mapping
    ADD CONSTRAINT accountview_relatie_mapping_pkey PRIMARY KEY (id);


--
-- Name: activiteiten activiteiten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activiteiten
    ADD CONSTRAINT activiteiten_pkey PRIMARY KEY (id);


--
-- Name: ai_aanroepen ai_aanroepen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_aanroepen
    ADD CONSTRAINT ai_aanroepen_pkey PRIMARY KEY (id);


--
-- Name: ai_beslissingen ai_beslissingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_beslissingen
    ADD CONSTRAINT ai_beslissingen_pkey PRIMARY KEY (id);


--
-- Name: ai_beslissingen ai_beslissingen_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_beslissingen
    ADD CONSTRAINT ai_beslissingen_token_unique UNIQUE (token);


--
-- Name: ai_categorie_correcties ai_categorie_correcties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_categorie_correcties
    ADD CONSTRAINT ai_categorie_correcties_pkey PRIMARY KEY (id);


--
-- Name: ai_prompt_scans ai_prompt_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_prompt_scans
    ADD CONSTRAINT ai_prompt_scans_pkey PRIMARY KEY (id);


--
-- Name: ai_veld_correcties ai_veld_correcties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_veld_correcties
    ADD CONSTRAINT ai_veld_correcties_pkey PRIMARY KEY (id);


--
-- Name: ai_wijzigingsvoorstellen ai_wijzigingsvoorstellen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_wijzigingsvoorstellen
    ADD CONSTRAINT ai_wijzigingsvoorstellen_pkey PRIMARY KEY (id);


--
-- Name: app_instellingen app_instellingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_instellingen
    ADD CONSTRAINT app_instellingen_pkey PRIMARY KEY (id);


--
-- Name: arbeidsovereenkomsten arbeidsovereenkomsten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arbeidsovereenkomsten
    ADD CONSTRAINT arbeidsovereenkomsten_pkey PRIMARY KEY (id);


--
-- Name: artikelen artikelen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artikelen
    ADD CONSTRAINT artikelen_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: avg_inzageverzoeken avg_inzageverzoeken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avg_inzageverzoeken
    ADD CONSTRAINT avg_inzageverzoeken_pkey PRIMARY KEY (id);


--
-- Name: avg_opschoon_log avg_opschoon_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avg_opschoon_log
    ADD CONSTRAINT avg_opschoon_log_pkey PRIMARY KEY (id);


--
-- Name: avg_verwerkers avg_verwerkers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avg_verwerkers
    ADD CONSTRAINT avg_verwerkers_pkey PRIMARY KEY (id);


--
-- Name: backup_records backup_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_records
    ADD CONSTRAINT backup_records_pkey PRIMARY KEY (id);


--
-- Name: backup_records backup_records_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_records
    ADD CONSTRAINT backup_records_slug_unique UNIQUE (slug);


--
-- Name: bedrijfssluitingen bedrijfssluitingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bedrijfssluitingen
    ADD CONSTRAINT bedrijfssluitingen_pkey PRIMARY KEY (id);


--
-- Name: bekwaamheden bekwaamheden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bekwaamheden
    ADD CONSTRAINT bekwaamheden_pkey PRIMARY KEY (id);


--
-- Name: boekhouder_uploads boekhouder_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boekhouder_uploads
    ADD CONSTRAINT boekhouder_uploads_pkey PRIMARY KEY (id);


--
-- Name: brandstof_importen brandstof_importen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_importen
    ADD CONSTRAINT brandstof_importen_pkey PRIMARY KEY (id);


--
-- Name: brandstof_regels brandstof_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_regels
    ADD CONSTRAINT brandstof_regels_pkey PRIMARY KEY (id);


--
-- Name: bruikleen_overeenkomsten bruikleen_overeenkomsten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bruikleen_overeenkomsten
    ADD CONSTRAINT bruikleen_overeenkomsten_pkey PRIMARY KEY (id);


--
-- Name: calculatie_regels calculatie_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calculatie_regels
    ADD CONSTRAINT calculatie_regels_pkey PRIMARY KEY (id);


--
-- Name: calculaties calculaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calculaties
    ADD CONSTRAINT calculaties_pkey PRIMARY KEY (id);


--
-- Name: chat_berichten chat_berichten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_berichten
    ADD CONSTRAINT chat_berichten_pkey PRIMARY KEY (id);


--
-- Name: chat_deelnemers chat_deelnemers_gesprek_gebruiker; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_deelnemers
    ADD CONSTRAINT chat_deelnemers_gesprek_gebruiker UNIQUE (gesprek_id, gebruiker_id);


--
-- Name: chat_deelnemers chat_deelnemers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_deelnemers
    ADD CONSTRAINT chat_deelnemers_pkey PRIMARY KEY (id);


--
-- Name: chat_gesprekken chat_gesprekken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_gesprekken
    ADD CONSTRAINT chat_gesprekken_pkey PRIMARY KEY (id);


--
-- Name: clusters clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clusters
    ADD CONSTRAINT clusters_pkey PRIMARY KEY (id);


--
-- Name: compliance_signalen compliance_signalen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_signalen
    ADD CONSTRAINT compliance_signalen_pkey PRIMARY KEY (id);


--
-- Name: constructie_templates constructie_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.constructie_templates
    ADD CONSTRAINT constructie_templates_pkey PRIMARY KEY (id);


--
-- Name: contract_besluiten contract_besluiten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_besluiten
    ADD CONSTRAINT contract_besluiten_pkey PRIMARY KEY (id);


--
-- Name: contract_signaleringen contract_signaleringen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_signaleringen
    ADD CONSTRAINT contract_signaleringen_pkey PRIMARY KEY (id);


--
-- Name: cqo_bevindingen cqo_bevindingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cqo_bevindingen
    ADD CONSTRAINT cqo_bevindingen_pkey PRIMARY KEY (id);


--
-- Name: cqo_runs cqo_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cqo_runs
    ADD CONSTRAINT cqo_runs_pkey PRIMARY KEY (id);


--
-- Name: cqo_verbeterpunten cqo_verbeterpunten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cqo_verbeterpunten
    ADD CONSTRAINT cqo_verbeterpunten_pkey PRIMARY KEY (id);


--
-- Name: crm_commercieel crm_commercieel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_commercieel
    ADD CONSTRAINT crm_commercieel_pkey PRIMARY KEY (id);


--
-- Name: crm_communicatie crm_communicatie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communicatie
    ADD CONSTRAINT crm_communicatie_pkey PRIMARY KEY (id);


--
-- Name: crm_concurrenten crm_concurrenten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_concurrenten
    ADD CONSTRAINT crm_concurrenten_pkey PRIMARY KEY (id);


--
-- Name: crm_contactpersonen crm_contactpersonen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contactpersonen
    ADD CONSTRAINT crm_contactpersonen_pkey PRIMARY KEY (id);


--
-- Name: crm_financieel crm_financieel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_financieel
    ADD CONSTRAINT crm_financieel_pkey PRIMARY KEY (id);


--
-- Name: crm_klanten crm_klanten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_klanten
    ADD CONSTRAINT crm_klanten_pkey PRIMARY KEY (id);


--
-- Name: crm_marktintelligentie crm_marktintelligentie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marktintelligentie
    ADD CONSTRAINT crm_marktintelligentie_pkey PRIMARY KEY (id);


--
-- Name: crm_opdrachten crm_opdrachten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_opdrachten
    ADD CONSTRAINT crm_opdrachten_pkey PRIMARY KEY (id);


--
-- Name: crm_relatievoorstellen crm_relatievoorstellen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_relatievoorstellen
    ADD CONSTRAINT crm_relatievoorstellen_pkey PRIMARY KEY (id);


--
-- Name: crm_scout_runs crm_scout_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_scout_runs
    ADD CONSTRAINT crm_scout_runs_pkey PRIMARY KEY (id);


--
-- Name: crm_taken crm_taken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_taken
    ADD CONSTRAINT crm_taken_pkey PRIMARY KEY (id);


--
-- Name: declaratie_beleid declaratie_beleid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaratie_beleid
    ADD CONSTRAINT declaratie_beleid_pkey PRIMARY KEY (id);


--
-- Name: declaraties declaraties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.declaraties
    ADD CONSTRAINT declaraties_pkey PRIMARY KEY (id);


--
-- Name: document_classificatie_correcties document_classificatie_correcties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_classificatie_correcties
    ADD CONSTRAINT document_classificatie_correcties_pkey PRIMARY KEY (id);


--
-- Name: document_goedkeuringen document_goedkeuringen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_goedkeuringen
    ADD CONSTRAINT document_goedkeuringen_pkey PRIMARY KEY (id);


--
-- Name: document_koppelingen document_koppelingen_document_id_doel_type_doel_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_koppelingen
    ADD CONSTRAINT document_koppelingen_document_id_doel_type_doel_id_unique UNIQUE (document_id, doel_type, doel_id);


--
-- Name: document_koppelingen document_koppelingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_koppelingen
    ADD CONSTRAINT document_koppelingen_pkey PRIMARY KEY (id);


--
-- Name: document_logboek document_logboek_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_logboek
    ADD CONSTRAINT document_logboek_pkey PRIMARY KEY (id);


--
-- Name: document_studio_modellen document_studio_modellen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_studio_modellen
    ADD CONSTRAINT document_studio_modellen_pkey PRIMARY KEY (id);


--
-- Name: document_toepassingen document_toepassingen_document_id_label_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_toepassingen
    ADD CONSTRAINT document_toepassingen_document_id_label_id_unique UNIQUE (document_id, label_id);


--
-- Name: document_toepassingen document_toepassingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_toepassingen
    ADD CONSTRAINT document_toepassingen_pkey PRIMARY KEY (id);


--
-- Name: documenten documenten_groep_id_revisie_nummer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documenten
    ADD CONSTRAINT documenten_groep_id_revisie_nummer_unique UNIQUE (groep_id, revisie_nummer);


--
-- Name: documenten documenten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documenten
    ADD CONSTRAINT documenten_pkey PRIMARY KEY (id);


--
-- Name: dossier_documenten dossier_documenten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_documenten
    ADD CONSTRAINT dossier_documenten_pkey PRIMARY KEY (id);


--
-- Name: dossiers dossiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_pkey PRIMARY KEY (id);


--
-- Name: eenheidsprijzen eenheidsprijzen_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eenheidsprijzen
    ADD CONSTRAINT eenheidsprijzen_code_unique UNIQUE (code);


--
-- Name: eenheidsprijzen eenheidsprijzen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.eenheidsprijzen
    ADD CONSTRAINT eenheidsprijzen_pkey PRIMARY KEY (id);


--
-- Name: fabrikanten fabrikanten_naam_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fabrikanten
    ADD CONSTRAINT fabrikanten_naam_unique UNIQUE (naam);


--
-- Name: fabrikanten fabrikanten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fabrikanten
    ADD CONSTRAINT fabrikanten_pkey PRIMARY KEY (id);


--
-- Name: facturen facturen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_pkey PRIMARY KEY (id);


--
-- Name: factuur_correspondentie factuur_correspondentie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_correspondentie
    ADD CONSTRAINT factuur_correspondentie_pkey PRIMARY KEY (id);


--
-- Name: factuur_herinneringen factuur_herinneringen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_herinneringen
    ADD CONSTRAINT factuur_herinneringen_pkey PRIMARY KEY (id);


--
-- Name: factuur_import_instellingen factuur_import_instellingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_import_instellingen
    ADD CONSTRAINT factuur_import_instellingen_pkey PRIMARY KEY (id);


--
-- Name: factuur_import_log factuur_import_log_message_id_bijlage_naam_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_import_log
    ADD CONSTRAINT factuur_import_log_message_id_bijlage_naam_unique UNIQUE (message_id, bijlage_naam);


--
-- Name: factuur_import_log factuur_import_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_import_log
    ADD CONSTRAINT factuur_import_log_pkey PRIMARY KEY (id);


--
-- Name: factuur_opmerkingen factuur_opmerkingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_opmerkingen
    ADD CONSTRAINT factuur_opmerkingen_pkey PRIMARY KEY (id);


--
-- Name: factuur_regels factuur_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_regels
    ADD CONSTRAINT factuur_regels_pkey PRIMARY KEY (id);


--
-- Name: factuur_signalen factuur_signalen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_signalen
    ADD CONSTRAINT factuur_signalen_pkey PRIMARY KEY (id);


--
-- Name: factuur_termijnen factuur_termijnen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_termijnen
    ADD CONSTRAINT factuur_termijnen_pkey PRIMARY KEY (id);


--
-- Name: factuur_tijdlijn factuur_tijdlijn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_tijdlijn
    ADD CONSTRAINT factuur_tijdlijn_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: feestdagen feestdagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feestdagen
    ADD CONSTRAINT feestdagen_pkey PRIMARY KEY (id);


--
-- Name: fie_ak_posten fie_ak_posten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_ak_posten
    ADD CONSTRAINT fie_ak_posten_pkey PRIMARY KEY (id);


--
-- Name: fie_capaciteit_snapshots fie_capaciteit_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_capaciteit_snapshots
    ADD CONSTRAINT fie_capaciteit_snapshots_pkey PRIMARY KEY (id);


--
-- Name: fie_jaarbegrotingen fie_jaarbegrotingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_jaarbegrotingen
    ADD CONSTRAINT fie_jaarbegrotingen_pkey PRIMARY KEY (id);


--
-- Name: fie_leermomenten fie_leermomenten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_leermomenten
    ADD CONSTRAINT fie_leermomenten_pkey PRIMARY KEY (id);


--
-- Name: fie_leermomenten fie_leermomenten_werktype_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_leermomenten
    ADD CONSTRAINT fie_leermomenten_werktype_unique UNIQUE (werktype);


--
-- Name: fie_nacalculaties fie_nacalculaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_nacalculaties
    ADD CONSTRAINT fie_nacalculaties_pkey PRIMARY KEY (id);


--
-- Name: fie_observaties fie_observaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_observaties
    ADD CONSTRAINT fie_observaties_pkey PRIMARY KEY (id);


--
-- Name: financiele_contract_kosten financiele_contract_kosten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_kosten
    ADD CONSTRAINT financiele_contract_kosten_pkey PRIMARY KEY (id);


--
-- Name: financiele_contract_signaleringen financiele_contract_signaleringen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_signaleringen
    ADD CONSTRAINT financiele_contract_signaleringen_pkey PRIMARY KEY (id);


--
-- Name: financiele_contracten financiele_contracten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contracten
    ADD CONSTRAINT financiele_contracten_pkey PRIMARY KEY (id);


--
-- Name: financiele_document_log financiele_document_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_document_log
    ADD CONSTRAINT financiele_document_log_pkey PRIMARY KEY (id);


--
-- Name: financiele_documenten financiele_documenten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_documenten
    ADD CONSTRAINT financiele_documenten_pkey PRIMARY KEY (id);


--
-- Name: financiele_kerncijfers financiele_kerncijfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_kerncijfers
    ADD CONSTRAINT financiele_kerncijfers_pkey PRIMARY KEY (id);


--
-- Name: fotos fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos
    ADD CONSTRAINT fotos_pkey PRIMARY KEY (id);


--
-- Name: fps_bedrijfsstandaarden fps_bedrijfsstandaarden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_bedrijfsstandaarden
    ADD CONSTRAINT fps_bedrijfsstandaarden_pkey PRIMARY KEY (id);


--
-- Name: fps_bedrijfsstandaarden fps_bedrijfsstandaarden_sleutel_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_bedrijfsstandaarden
    ADD CONSTRAINT fps_bedrijfsstandaarden_sleutel_unique UNIQUE (sleutel);


--
-- Name: fps_visual_annotaties fps_visual_annotaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_visual_annotaties
    ADD CONSTRAINT fps_visual_annotaties_pkey PRIMARY KEY (id);


--
-- Name: fps_visuals fps_visuals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_visuals
    ADD CONSTRAINT fps_visuals_pkey PRIMARY KEY (id);


--
-- Name: functie_opleidingen functie_opleidingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.functie_opleidingen
    ADD CONSTRAINT functie_opleidingen_pkey PRIMARY KEY (id);


--
-- Name: functies functies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.functies
    ADD CONSTRAINT functies_pkey PRIMARY KEY (id);


--
-- Name: gebouw_email_bijlagen gebouw_email_bijlagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_email_bijlagen
    ADD CONSTRAINT gebouw_email_bijlagen_pkey PRIMARY KEY (id);


--
-- Name: gebouw_email_samenvattingen gebouw_email_samenvattingen_gebouw_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_email_samenvattingen
    ADD CONSTRAINT gebouw_email_samenvattingen_gebouw_id_unique UNIQUE (gebouw_id);


--
-- Name: gebouw_email_samenvattingen gebouw_email_samenvattingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_email_samenvattingen
    ADD CONSTRAINT gebouw_email_samenvattingen_pkey PRIMARY KEY (id);


--
-- Name: gebouw_emails gebouw_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_emails
    ADD CONSTRAINT gebouw_emails_pkey PRIMARY KEY (id);


--
-- Name: gebouw_partijen gebouw_partijen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_partijen
    ADD CONSTRAINT gebouw_partijen_pkey PRIMARY KEY (id);


--
-- Name: gebouw_publicaties gebouw_publicaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_publicaties
    ADD CONSTRAINT gebouw_publicaties_pkey PRIMARY KEY (id);


--
-- Name: gebouw_toewijzingen gebouw_toewijzingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_toewijzingen
    ADD CONSTRAINT gebouw_toewijzingen_pkey PRIMARY KEY (id);


--
-- Name: gebouwen gebouwen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouwen
    ADD CONSTRAINT gebouwen_pkey PRIMARY KEY (id);


--
-- Name: gebouwen gebouwen_projectnummer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouwen
    ADD CONSTRAINT gebouwen_projectnummer_unique UNIQUE (projectnummer);


--
-- Name: gebouwen gebouwen_werknummer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouwen
    ADD CONSTRAINT gebouwen_werknummer_unique UNIQUE (werknummer);


--
-- Name: gebruiker_profielen gebruiker_profielen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruiker_profielen
    ADD CONSTRAINT gebruiker_profielen_pkey PRIMARY KEY (id);


--
-- Name: gebruikers gebruikers_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruikers
    ADD CONSTRAINT gebruikers_email_unique UNIQUE (email);


--
-- Name: gebruikers_meldingen gebruikers_meldingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruikers_meldingen
    ADD CONSTRAINT gebruikers_meldingen_pkey PRIMARY KEY (id);


--
-- Name: gebruikers gebruikers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruikers
    ADD CONSTRAINT gebruikers_pkey PRIMARY KEY (id);


--
-- Name: gebruikers gebruikers_uitnodiging_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruikers
    ADD CONSTRAINT gebruikers_uitnodiging_token_unique UNIQUE (uitnodiging_token);


--
-- Name: gereedschap_meldingen gereedschap_meldingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschap_meldingen
    ADD CONSTRAINT gereedschap_meldingen_pkey PRIMARY KEY (id);


--
-- Name: gereedschappen gereedschappen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschappen
    ADD CONSTRAINT gereedschappen_pkey PRIMARY KEY (id);


--
-- Name: gereedschappen gereedschappen_volgnummer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschappen
    ADD CONSTRAINT gereedschappen_volgnummer_unique UNIQUE (volgnummer);


--
-- Name: go_live_adviezen go_live_adviezen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.go_live_adviezen
    ADD CONSTRAINT go_live_adviezen_pkey PRIMARY KEY (id);


--
-- Name: go_live_fasen go_live_fasen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.go_live_fasen
    ADD CONSTRAINT go_live_fasen_pkey PRIMARY KEY (id);


--
-- Name: go_live_fasen go_live_fasen_sleutel_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.go_live_fasen
    ADD CONSTRAINT go_live_fasen_sleutel_unique UNIQUE (sleutel);


--
-- Name: go_live_lessen go_live_lessen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.go_live_lessen
    ADD CONSTRAINT go_live_lessen_pkey PRIMARY KEY (id);


--
-- Name: goedkeuring_aanvragen goedkeuring_aanvragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_aanvragen
    ADD CONSTRAINT goedkeuring_aanvragen_pkey PRIMARY KEY (id);


--
-- Name: goedkeuring_beleidsregels goedkeuring_beleidsregels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_beleidsregels
    ADD CONSTRAINT goedkeuring_beleidsregels_pkey PRIMARY KEY (id);


--
-- Name: goedkeuring_escalaties goedkeuring_escalaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_escalaties
    ADD CONSTRAINT goedkeuring_escalaties_pkey PRIMARY KEY (id);


--
-- Name: goedkeuring_stappen goedkeuring_stappen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_stappen
    ADD CONSTRAINT goedkeuring_stappen_pkey PRIMARY KEY (id);


--
-- Name: governance_checks governance_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_checks
    ADD CONSTRAINT governance_checks_pkey PRIMARY KEY (id);


--
-- Name: governance_wachtrij governance_wachtrij_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_wachtrij
    ADD CONSTRAINT governance_wachtrij_pkey PRIMARY KEY (id);


--
-- Name: helpdesk_tickets helpdesk_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_pkey PRIMARY KEY (id);


--
-- Name: hrm_ai_voorstellen hrm_ai_voorstellen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_ai_voorstellen
    ADD CONSTRAINT hrm_ai_voorstellen_pkey PRIMARY KEY (id);


--
-- Name: hrm_middelen hrm_middelen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_middelen
    ADD CONSTRAINT hrm_middelen_pkey PRIMARY KEY (id);


--
-- Name: hrm_onboarding_taken hrm_onboarding_taken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_onboarding_taken
    ADD CONSTRAINT hrm_onboarding_taken_pkey PRIMARY KEY (id);


--
-- Name: import_logs import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_pkey PRIMARY KEY (id);


--
-- Name: inbox_audit_log inbox_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_audit_log
    ADD CONSTRAINT inbox_audit_log_pkey PRIMARY KEY (id);


--
-- Name: inbox_items inbox_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_pkey PRIMARY KEY (id);


--
-- Name: inkoopbon_regels inkoopbon_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbon_regels
    ADD CONSTRAINT inkoopbon_regels_pkey PRIMARY KEY (id);


--
-- Name: inkoopbonnen inkoopbonnen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbonnen
    ADD CONSTRAINT inkoopbonnen_pkey PRIMARY KEY (id);


--
-- Name: inkoopplan_regels inkoopplan_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopplan_regels
    ADD CONSTRAINT inkoopplan_regels_pkey PRIMARY KEY (id);


--
-- Name: inkoopplannen inkoopplannen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopplannen
    ADD CONSTRAINT inkoopplannen_pkey PRIMARY KEY (id);


--
-- Name: inspectie_bevindingen inspectie_bevindingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspectie_bevindingen
    ADD CONSTRAINT inspectie_bevindingen_pkey PRIMARY KEY (id);


--
-- Name: inspecties inspecties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspecties
    ADD CONSTRAINT inspecties_pkey PRIMARY KEY (id);


--
-- Name: jaarafsluiting_regels jaarafsluiting_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jaarafsluiting_regels
    ADD CONSTRAINT jaarafsluiting_regels_pkey PRIMARY KEY (id);


--
-- Name: kantoor_releases kantoor_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kantoor_releases
    ADD CONSTRAINT kantoor_releases_pkey PRIMARY KEY (id);


--
-- Name: label_applicaties label_applicaties_label_id_type_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label_applicaties
    ADD CONSTRAINT label_applicaties_label_id_type_code_unique UNIQUE (label_id, type_code);


--
-- Name: label_applicaties label_applicaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label_applicaties
    ADD CONSTRAINT label_applicaties_pkey PRIMARY KEY (id);


--
-- Name: labels labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_pkey PRIMARY KEY (id);


--
-- Name: leesbevestigingen leesbevestigingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leesbevestigingen
    ADD CONSTRAINT leesbevestigingen_pkey PRIMARY KEY (id);


--
-- Name: leverancier_categorisatie leverancier_categorisatie_leverancier_id_grootboekrekening_kost; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leverancier_categorisatie
    ADD CONSTRAINT leverancier_categorisatie_leverancier_id_grootboekrekening_kost UNIQUE (leverancier_id, grootboekrekening, kostenplaats, categorie, btw_code);


--
-- Name: leverancier_categorisatie leverancier_categorisatie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leverancier_categorisatie
    ADD CONSTRAINT leverancier_categorisatie_pkey PRIMARY KEY (id);


--
-- Name: leverancier_prestaties leverancier_prestaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leverancier_prestaties
    ADD CONSTRAINT leverancier_prestaties_pkey PRIMARY KEY (id);


--
-- Name: leveranciers leveranciers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leveranciers
    ADD CONSTRAINT leveranciers_pkey PRIMARY KEY (id);


--
-- Name: login_pogingen login_pogingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_pogingen
    ADD CONSTRAINT login_pogingen_pkey PRIMARY KEY (id);


--
-- Name: loon_output_bestanden loon_output_bestanden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loon_output_bestanden
    ADD CONSTRAINT loon_output_bestanden_pkey PRIMARY KEY (id);


--
-- Name: magazijn_inkooporder_regels magazijn_inkooporder_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_inkooporder_regels
    ADD CONSTRAINT magazijn_inkooporder_regels_pkey PRIMARY KEY (id);


--
-- Name: magazijn_inkooporders magazijn_inkooporders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_inkooporders
    ADD CONSTRAINT magazijn_inkooporders_pkey PRIMARY KEY (id);


--
-- Name: magazijn_instellingen magazijn_instellingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_instellingen
    ADD CONSTRAINT magazijn_instellingen_pkey PRIMARY KEY (id);


--
-- Name: magazijn_locaties magazijn_locaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_locaties
    ADD CONSTRAINT magazijn_locaties_pkey PRIMARY KEY (id);


--
-- Name: magazijn_picklijst_regels magazijn_picklijst_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijst_regels
    ADD CONSTRAINT magazijn_picklijst_regels_pkey PRIMARY KEY (id);


--
-- Name: magazijn_picklijsten magazijn_picklijsten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijsten
    ADD CONSTRAINT magazijn_picklijsten_pkey PRIMARY KEY (id);


--
-- Name: magazijn_snoozes magazijn_snoozes_artikel_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_snoozes
    ADD CONSTRAINT magazijn_snoozes_artikel_id_unique UNIQUE (artikel_id);


--
-- Name: magazijn_snoozes magazijn_snoozes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_snoozes
    ADD CONSTRAINT magazijn_snoozes_pkey PRIMARY KEY (id);


--
-- Name: magazijn_stellingscans magazijn_stellingscans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_stellingscans
    ADD CONSTRAINT magazijn_stellingscans_pkey PRIMARY KEY (id);


--
-- Name: mail_logboek mail_logboek_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_logboek
    ADD CONSTRAINT mail_logboek_pkey PRIMARY KEY (id);


--
-- Name: materiaal_aanvragen materiaal_aanvragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiaal_aanvragen
    ADD CONSTRAINT materiaal_aanvragen_pkey PRIMARY KEY (id);


--
-- Name: medewerker_aanstellingen medewerker_aanstellingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_aanstellingen
    ADD CONSTRAINT medewerker_aanstellingen_pkey PRIMARY KEY (id);


--
-- Name: medewerker_cao_keuzes medewerker_cao_keuzes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_cao_keuzes
    ADD CONSTRAINT medewerker_cao_keuzes_pkey PRIMARY KEY (id);


--
-- Name: medewerker_documenten medewerker_documenten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_documenten
    ADD CONSTRAINT medewerker_documenten_pkey PRIMARY KEY (id);


--
-- Name: medewerker_opleidingen medewerker_opleidingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_opleidingen
    ADD CONSTRAINT medewerker_opleidingen_pkey PRIMARY KEY (id);


--
-- Name: medewerkers medewerkers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerkers
    ADD CONSTRAINT medewerkers_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_adviezen mod_calc_adviezen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_adviezen
    ADD CONSTRAINT mod_calc_adviezen_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_artikelen mod_calc_artikelen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_artikelen
    ADD CONSTRAINT mod_calc_artikelen_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_bronbestanden mod_calc_bronbestanden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_bronbestanden
    ADD CONSTRAINT mod_calc_bronbestanden_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_eenheden mod_calc_eenheden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_eenheden
    ADD CONSTRAINT mod_calc_eenheden_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_headers mod_calc_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_headers
    ADD CONSTRAINT mod_calc_headers_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_inkoop_items mod_calc_inkoop_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_inkoop_items
    ADD CONSTRAINT mod_calc_inkoop_items_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_leveranciers mod_calc_leveranciers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_leveranciers
    ADD CONSTRAINT mod_calc_leveranciers_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_normtijden mod_calc_normtijden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_normtijden
    ADD CONSTRAINT mod_calc_normtijden_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_regels mod_calc_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_regels
    ADD CONSTRAINT mod_calc_regels_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_tarieven mod_calc_tarieven_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_tarieven
    ADD CONSTRAINT mod_calc_tarieven_pkey PRIMARY KEY (id);


--
-- Name: mod_calc_versies mod_calc_versies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_versies
    ADD CONSTRAINT mod_calc_versies_pkey PRIMARY KEY (id);


--
-- Name: module_beoordelingen module_beoordelingen_module_sleutel_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_beoordelingen
    ADD CONSTRAINT module_beoordelingen_module_sleutel_unique UNIQUE (module_sleutel);


--
-- Name: module_beoordelingen module_beoordelingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_beoordelingen
    ADD CONSTRAINT module_beoordelingen_pkey PRIMARY KEY (id);


--
-- Name: monteur_achievements monteur_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monteur_achievements
    ADD CONSTRAINT monteur_achievements_pkey PRIMARY KEY (id);


--
-- Name: muis_gebeurtenissen muis_gebeurtenissen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muis_gebeurtenissen
    ADD CONSTRAINT muis_gebeurtenissen_pkey PRIMARY KEY (id);


--
-- Name: object_rechten object_rechten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_rechten
    ADD CONSTRAINT object_rechten_pkey PRIMARY KEY (id);


--
-- Name: offerte_bijlagen offerte_bijlagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_bijlagen
    ADD CONSTRAINT offerte_bijlagen_pkey PRIMARY KEY (id);


--
-- Name: offerte_contract_adviezen offerte_contract_adviezen_contract_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_contract_adviezen
    ADD CONSTRAINT offerte_contract_adviezen_contract_id_unique UNIQUE (contract_id);


--
-- Name: offerte_contract_adviezen offerte_contract_adviezen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_contract_adviezen
    ADD CONSTRAINT offerte_contract_adviezen_pkey PRIMARY KEY (id);


--
-- Name: offerte_email_log offerte_email_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_email_log
    ADD CONSTRAINT offerte_email_log_pkey PRIMARY KEY (id);


--
-- Name: offerte_handtekeningen offerte_handtekeningen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_handtekeningen
    ADD CONSTRAINT offerte_handtekeningen_pkey PRIMARY KEY (id);


--
-- Name: offerte_hoofdstukken offerte_hoofdstukken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_hoofdstukken
    ADD CONSTRAINT offerte_hoofdstukken_pkey PRIMARY KEY (id);


--
-- Name: offerte_klant_contracten offerte_klant_contracten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_klant_contracten
    ADD CONSTRAINT offerte_klant_contracten_pkey PRIMARY KEY (id);


--
-- Name: offerte_portaal_tokens offerte_portaal_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_portaal_tokens
    ADD CONSTRAINT offerte_portaal_tokens_pkey PRIMARY KEY (id);


--
-- Name: offerte_portaal_tokens offerte_portaal_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_portaal_tokens
    ADD CONSTRAINT offerte_portaal_tokens_token_unique UNIQUE (token);


--
-- Name: offerte_regels offerte_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_regels
    ADD CONSTRAINT offerte_regels_pkey PRIMARY KEY (id);


--
-- Name: offerte_secties offerte_secties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_secties
    ADD CONSTRAINT offerte_secties_pkey PRIMARY KEY (id);


--
-- Name: offerte_sjablonen offerte_sjablonen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_sjablonen
    ADD CONSTRAINT offerte_sjablonen_pkey PRIMARY KEY (id);


--
-- Name: offerte_tracking offerte_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_tracking
    ADD CONSTRAINT offerte_tracking_pkey PRIMARY KEY (id);


--
-- Name: offerte_uitgangspunten offerte_uitgangspunten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_uitgangspunten
    ADD CONSTRAINT offerte_uitgangspunten_pkey PRIMARY KEY (id);


--
-- Name: offerte_versies offerte_versies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_versies
    ADD CONSTRAINT offerte_versies_pkey PRIMARY KEY (id);


--
-- Name: offerte_voorwaarden_sets offerte_voorwaarden_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_voorwaarden_sets
    ADD CONSTRAINT offerte_voorwaarden_sets_pkey PRIMARY KEY (id);


--
-- Name: offerte_vragen offerte_vragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_vragen
    ADD CONSTRAINT offerte_vragen_pkey PRIMARY KEY (id);


--
-- Name: offertes offertes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_pkey PRIMARY KEY (id);


--
-- Name: onderaannemer_orders onderaannemer_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderaannemer_orders
    ADD CONSTRAINT onderaannemer_orders_pkey PRIMARY KEY (id);


--
-- Name: onderhanden_werk_overrides onderhanden_werk_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhanden_werk_overrides
    ADD CONSTRAINT onderhanden_werk_overrides_pkey PRIMARY KEY (id);


--
-- Name: onderhoud onderhoud_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoud
    ADD CONSTRAINT onderhoud_pkey PRIMARY KEY (id);


--
-- Name: onderhoudscontracten onderhoudscontracten_contractnummer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoudscontracten
    ADD CONSTRAINT onderhoudscontracten_contractnummer_unique UNIQUE (contractnummer);


--
-- Name: onderhoudscontracten onderhoudscontracten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoudscontracten
    ADD CONSTRAINT onderhoudscontracten_pkey PRIMARY KEY (id);


--
-- Name: opdrachten opdrachten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachten
    ADD CONSTRAINT opdrachten_pkey PRIMARY KEY (id);


--
-- Name: opdrachtgever_voorkeuren opdrachtgever_voorkeuren_klant_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachtgever_voorkeuren
    ADD CONSTRAINT opdrachtgever_voorkeuren_klant_id_unique UNIQUE (klant_id);


--
-- Name: opdrachtgever_voorkeuren opdrachtgever_voorkeuren_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachtgever_voorkeuren
    ADD CONSTRAINT opdrachtgever_voorkeuren_pkey PRIMARY KEY (id);


--
-- Name: opleidingen opleidingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opleidingen
    ADD CONSTRAINT opleidingen_pkey PRIMARY KEY (id);


--
-- Name: opleverrapporten opleverrapporten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opleverrapporten
    ADD CONSTRAINT opleverrapporten_pkey PRIMARY KEY (id);


--
-- Name: opname_fotos opname_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_fotos
    ADD CONSTRAINT opname_fotos_pkey PRIMARY KEY (id);


--
-- Name: opname_items opname_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_items
    ADD CONSTRAINT opname_items_pkey PRIMARY KEY (id);


--
-- Name: opnames opnames_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opnames
    ADD CONSTRAINT opnames_pkey PRIMARY KEY (id);


--
-- Name: org_bedrijfsdocumenten org_bedrijfsdocumenten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_bedrijfsdocumenten
    ADD CONSTRAINT org_bedrijfsdocumenten_pkey PRIMARY KEY (id);


--
-- Name: org_jaarverslagen org_jaarverslagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_jaarverslagen
    ADD CONSTRAINT org_jaarverslagen_pkey PRIMARY KEY (id);


--
-- Name: org_verzekeringen org_verzekeringen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_verzekeringen
    ADD CONSTRAINT org_verzekeringen_pkey PRIMARY KEY (id);


--
-- Name: pbm_inspecties pbm_inspecties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_inspecties
    ADD CONSTRAINT pbm_inspecties_pkey PRIMARY KEY (id);


--
-- Name: pbm_items pbm_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_items
    ADD CONSTRAINT pbm_items_pkey PRIMARY KEY (id);


--
-- Name: pim_foto_analyses pim_foto_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_foto_analyses
    ADD CONSTRAINT pim_foto_analyses_pkey PRIMARY KEY (id);


--
-- Name: pim_modellen pim_modellen_opdracht_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_modellen
    ADD CONSTRAINT pim_modellen_opdracht_id_unique UNIQUE (opdracht_id);


--
-- Name: pim_modellen pim_modellen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_modellen
    ADD CONSTRAINT pim_modellen_pkey PRIMARY KEY (id);


--
-- Name: pim_uitvoering_stappen pim_uitvoering_stappen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_uitvoering_stappen
    ADD CONSTRAINT pim_uitvoering_stappen_pkey PRIMARY KEY (id);


--
-- Name: planning_afwezigheid planning_afwezigheid_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_afwezigheid
    ADD CONSTRAINT planning_afwezigheid_pkey PRIMARY KEY (id);


--
-- Name: planning_items planning_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_pkey PRIMARY KEY (id);


--
-- Name: planning_meerwerk planning_meerwerk_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_meerwerk
    ADD CONSTRAINT planning_meerwerk_pkey PRIMARY KEY (id);


--
-- Name: poortwachter_dossiers poortwachter_dossiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_dossiers
    ADD CONSTRAINT poortwachter_dossiers_pkey PRIMARY KEY (id);


--
-- Name: poortwachter_dossiers poortwachter_dossiers_ziekmelding_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_dossiers
    ADD CONSTRAINT poortwachter_dossiers_ziekmelding_id_unique UNIQUE (ziekmelding_id);


--
-- Name: poortwachter_mijlpalen poortwachter_mijlpalen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_mijlpalen
    ADD CONSTRAINT poortwachter_mijlpalen_pkey PRIMARY KEY (id);


--
-- Name: profielen profielen_naam_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profielen
    ADD CONSTRAINT profielen_naam_unique UNIQUE (naam);


--
-- Name: profielen profielen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profielen
    ADD CONSTRAINT profielen_pkey PRIMARY KEY (id);


--
-- Name: project_begrotingen project_begrotingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_begrotingen
    ADD CONSTRAINT project_begrotingen_pkey PRIMARY KEY (id);


--
-- Name: projecten projecten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projecten
    ADD CONSTRAINT projecten_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: regie_begroting regie_begroting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_begroting
    ADD CONSTRAINT regie_begroting_pkey PRIMARY KEY (id);


--
-- Name: regie_materialen regie_materialen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_materialen
    ADD CONSTRAINT regie_materialen_pkey PRIMARY KEY (id);


--
-- Name: regie_tarieven regie_tarieven_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_tarieven
    ADD CONSTRAINT regie_tarieven_pkey PRIMARY KEY (id);


--
-- Name: regie_voorwaarden regie_voorwaarden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_voorwaarden
    ADD CONSTRAINT regie_voorwaarden_pkey PRIMARY KEY (id);


--
-- Name: release_update_notes release_update_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_update_notes
    ADD CONSTRAINT release_update_notes_pkey PRIMARY KEY (id);


--
-- Name: reserveringen reserveringen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserveringen
    ADD CONSTRAINT reserveringen_pkey PRIMARY KEY (id);


--
-- Name: salaris_audit_ext salaris_audit_ext_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaris_audit_ext
    ADD CONSTRAINT salaris_audit_ext_pkey PRIMARY KEY (id);


--
-- Name: salaris_mutaties salaris_mutaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaris_mutaties
    ADD CONSTRAINT salaris_mutaties_pkey PRIMARY KEY (id);


--
-- Name: salarisbatches salarisbatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbatches
    ADD CONSTRAINT salarisbatches_pkey PRIMARY KEY (id);


--
-- Name: salarisbestanden salarisbestanden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbestanden
    ADD CONSTRAINT salarisbestanden_pkey PRIMARY KEY (id);


--
-- Name: salarisdocument_audit salarisdocument_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisdocument_audit
    ADD CONSTRAINT salarisdocument_audit_pkey PRIMARY KEY (id);


--
-- Name: scab_mail_bijlagen scab_mail_bijlagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mail_bijlagen
    ADD CONSTRAINT scab_mail_bijlagen_pkey PRIMARY KEY (id);


--
-- Name: scab_mails scab_mails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mails
    ADD CONSTRAINT scab_mails_pkey PRIMARY KEY (id);


--
-- Name: scheidingen scheidingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheidingen
    ADD CONSTRAINT scheidingen_pkey PRIMARY KEY (id);


--
-- Name: security_instellingen security_instellingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_instellingen
    ADD CONSTRAINT security_instellingen_pkey PRIMARY KEY (id);


--
-- Name: security_instellingen security_instellingen_sleutel_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_instellingen
    ADD CONSTRAINT security_instellingen_sleutel_unique UNIQUE (sleutel);


--
-- Name: security_intake_scans security_intake_scans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_intake_scans
    ADD CONSTRAINT security_intake_scans_pkey PRIMARY KEY (id);


--
-- Name: security_releases security_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_releases
    ADD CONSTRAINT security_releases_pkey PRIMARY KEY (id);


--
-- Name: security_scan_runs security_scan_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_scan_runs
    ADD CONSTRAINT security_scan_runs_pkey PRIMARY KEY (id);


--
-- Name: security_test_resultaten security_test_resultaten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_test_resultaten
    ADD CONSTRAINT security_test_resultaten_pkey PRIMARY KEY (id);


--
-- Name: sepa_bestanden sepa_bestanden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sepa_bestanden
    ADD CONSTRAINT sepa_bestanden_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: slim_upload_log slim_upload_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slim_upload_log
    ADD CONSTRAINT slim_upload_log_pkey PRIMARY KEY (id);


--
-- Name: snagstream_rapporten snagstream_rapporten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snagstream_rapporten
    ADD CONSTRAINT snagstream_rapporten_pkey PRIMARY KEY (id);


--
-- Name: snagstream_snags snagstream_snags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snagstream_snags
    ADD CONSTRAINT snagstream_snags_pkey PRIMARY KEY (id);


--
-- Name: spot_ai_voorstellen spot_ai_voorstellen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_ai_voorstellen
    ADD CONSTRAINT spot_ai_voorstellen_pkey PRIMARY KEY (id);


--
-- Name: spot_dossiers spot_dossiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_dossiers
    ADD CONSTRAINT spot_dossiers_pkey PRIMARY KEY (id);


--
-- Name: spot_dossiers spot_dossiers_voorziening_id_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_dossiers
    ADD CONSTRAINT spot_dossiers_voorziening_id_type_unique UNIQUE (voorziening_id, type);


--
-- Name: spot_status_configuratie spot_status_configuratie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_status_configuratie
    ADD CONSTRAINT spot_status_configuratie_pkey PRIMARY KEY (status_code);


--
-- Name: tekeningen tekeningen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tekeningen
    ADD CONSTRAINT tekeningen_pkey PRIMARY KEY (id);


--
-- Name: testrapporten testrapporten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testrapporten
    ADD CONSTRAINT testrapporten_pkey PRIMARY KEY (id);


--
-- Name: toolbox_berichten toolbox_berichten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_berichten
    ADD CONSTRAINT toolbox_berichten_pkey PRIMARY KEY (id);


--
-- Name: toolbox_maand_opdrachten toolbox_maand_opdrachten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_maand_opdrachten
    ADD CONSTRAINT toolbox_maand_opdrachten_pkey PRIMARY KEY (id);


--
-- Name: toolbox_maand_status toolbox_maand_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_maand_status
    ADD CONSTRAINT toolbox_maand_status_pkey PRIMARY KEY (id);


--
-- Name: uitvoerder_berichten uitvoerder_berichten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoerder_berichten
    ADD CONSTRAINT uitvoerder_berichten_pkey PRIMARY KEY (id);


--
-- Name: uitvoerder_sessies uitvoerder_sessies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoerder_sessies
    ADD CONSTRAINT uitvoerder_sessies_pkey PRIMARY KEY (id);


--
-- Name: uitvoeringsplan_taken uitvoeringsplan_taken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoeringsplan_taken
    ADD CONSTRAINT uitvoeringsplan_taken_pkey PRIMARY KEY (id);


--
-- Name: uitvoeringsplannen uitvoeringsplannen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoeringsplannen
    ADD CONSTRAINT uitvoeringsplannen_pkey PRIMARY KEY (id);


--
-- Name: financiele_contract_kosten uniek_contract_jaar; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_kosten
    ADD CONSTRAINT uniek_contract_jaar UNIQUE (contract_id, jaar);


--
-- Name: financiele_contract_signaleringen uniek_contract_signalering_dedupe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_signaleringen
    ADD CONSTRAINT uniek_contract_signalering_dedupe UNIQUE (dedupe_sleutel);


--
-- Name: uren_registraties uren_registraties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties
    ADD CONSTRAINT uren_registraties_pkey PRIMARY KEY (id);


--
-- Name: veiligheid_incidenten veiligheid_incidenten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_incidenten
    ADD CONSTRAINT veiligheid_incidenten_pkey PRIMARY KEY (id);


--
-- Name: veiligheid_lmras veiligheid_lmras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_lmras
    ADD CONSTRAINT veiligheid_lmras_pkey PRIMARY KEY (id);


--
-- Name: veiligheid_meldingen_acties veiligheid_meldingen_acties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen_acties
    ADD CONSTRAINT veiligheid_meldingen_acties_pkey PRIMARY KEY (id);


--
-- Name: veiligheid_meldingen veiligheid_meldingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen
    ADD CONSTRAINT veiligheid_meldingen_pkey PRIMARY KEY (id);


--
-- Name: veiligheid_toolbox_afrondingen veiligheid_toolbox_afrondingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolbox_afrondingen
    ADD CONSTRAINT veiligheid_toolbox_afrondingen_pkey PRIMARY KEY (id);


--
-- Name: veiligheid_toolbox_vragen veiligheid_toolbox_vragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolbox_vragen
    ADD CONSTRAINT veiligheid_toolbox_vragen_pkey PRIMARY KEY (id);


--
-- Name: veiligheid_toolboxen veiligheid_toolboxen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolboxen
    ADD CONSTRAINT veiligheid_toolboxen_pkey PRIMARY KEY (id);


--
-- Name: veiligheidsmiddel_inspecties veiligheidsmiddel_inspecties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheidsmiddel_inspecties
    ADD CONSTRAINT veiligheidsmiddel_inspecties_pkey PRIMARY KEY (id);


--
-- Name: veiligheidsmiddelen veiligheidsmiddelen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheidsmiddelen
    ADD CONSTRAINT veiligheidsmiddelen_pkey PRIMARY KEY (id);


--
-- Name: verdiepingen verdiepingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verdiepingen
    ADD CONSTRAINT verdiepingen_pkey PRIMARY KEY (id);


--
-- Name: verlof_aanvraag_log verlof_aanvraag_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_aanvraag_log
    ADD CONSTRAINT verlof_aanvraag_log_pkey PRIMARY KEY (id);


--
-- Name: verlof_correcties verlof_correcties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_correcties
    ADD CONSTRAINT verlof_correcties_pkey PRIMARY KEY (id);


--
-- Name: verlof_instellingen verlof_instellingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_instellingen
    ADD CONSTRAINT verlof_instellingen_pkey PRIMARY KEY (id);


--
-- Name: verlof_saldi verlof_saldi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_saldi
    ADD CONSTRAINT verlof_saldi_pkey PRIMARY KEY (id);


--
-- Name: verlofaanvragen verlofaanvragen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlofaanvragen
    ADD CONSTRAINT verlofaanvragen_pkey PRIMARY KEY (id);


--
-- Name: verlofsoorten verlofsoorten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlofsoorten
    ADD CONSTRAINT verlofsoorten_pkey PRIMARY KEY (id);


--
-- Name: vge_effectiviteitslog vge_effectiviteitslog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vge_effectiviteitslog
    ADD CONSTRAINT vge_effectiviteitslog_pkey PRIMARY KEY (id);


--
-- Name: voertuigen voertuigen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voertuigen
    ADD CONSTRAINT voertuigen_pkey PRIMARY KEY (id);


--
-- Name: voorraad voorraad_artikel_locatie; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad
    ADD CONSTRAINT voorraad_artikel_locatie UNIQUE (artikel_id, locatie_id);


--
-- Name: voorraad_mutaties voorraad_mutaties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad_mutaties
    ADD CONSTRAINT voorraad_mutaties_pkey PRIMARY KEY (id);


--
-- Name: voorraad voorraad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad
    ADD CONSTRAINT voorraad_pkey PRIMARY KEY (id);


--
-- Name: voorziening_labels voorziening_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorziening_labels
    ADD CONSTRAINT voorziening_labels_pkey PRIMARY KEY (id);


--
-- Name: voorziening_labels voorziening_labels_voorziening_id_label_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorziening_labels
    ADD CONSTRAINT voorziening_labels_voorziening_id_label_id_unique UNIQUE (voorziening_id, label_id);


--
-- Name: voorziening_types voorziening_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorziening_types
    ADD CONSTRAINT voorziening_types_pkey PRIMARY KEY (code);


--
-- Name: voorzieningen voorzieningen_objectnummer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorzieningen
    ADD CONSTRAINT voorzieningen_objectnummer_unique UNIQUE (objectnummer);


--
-- Name: voorzieningen voorzieningen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorzieningen
    ADD CONSTRAINT voorzieningen_pkey PRIMARY KEY (id);


--
-- Name: wachtwoord_reset_tokens wachtwoord_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wachtwoord_reset_tokens
    ADD CONSTRAINT wachtwoord_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: wachtwoord_reset_tokens wachtwoord_reset_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wachtwoord_reset_tokens
    ADD CONSTRAINT wachtwoord_reset_tokens_token_unique UNIQUE (token);


--
-- Name: wagenpark_avg_logboek wagenpark_avg_logboek_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_avg_logboek
    ADD CONSTRAINT wagenpark_avg_logboek_pkey PRIMARY KEY (id);


--
-- Name: wagenpark_kosten wagenpark_kosten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kosten
    ADD CONSTRAINT wagenpark_kosten_pkey PRIMARY KEY (id);


--
-- Name: wagenpark_kwartaalcontrole wagenpark_kwartaalcontrole_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kwartaalcontrole
    ADD CONSTRAINT wagenpark_kwartaalcontrole_pkey PRIMARY KEY (id);


--
-- Name: wagenpark_meldingen wagenpark_meldingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_meldingen
    ADD CONSTRAINT wagenpark_meldingen_pkey PRIMARY KEY (id);


--
-- Name: wagenpark_onderhoud wagenpark_onderhoud_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_onderhoud
    ADD CONSTRAINT wagenpark_onderhoud_pkey PRIMARY KEY (id);


--
-- Name: wagenpark_ritten wagenpark_ritten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_ritten
    ADD CONSTRAINT wagenpark_ritten_pkey PRIMARY KEY (id);


--
-- Name: wagenpark_sync_log wagenpark_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_sync_log
    ADD CONSTRAINT wagenpark_sync_log_pkey PRIMARY KEY (id);


--
-- Name: week_staten week_staten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.week_staten
    ADD CONSTRAINT week_staten_pkey PRIMARY KEY (id);


--
-- Name: werk_inbox_koppelingen werk_inbox_koppelingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_koppelingen
    ADD CONSTRAINT werk_inbox_koppelingen_pkey PRIMARY KEY (id);


--
-- Name: werk_inbox_koppelingen werk_inbox_koppelingen_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_koppelingen
    ADD CONSTRAINT werk_inbox_koppelingen_uq UNIQUE (message_id, gebruiker_id, entity_type, entity_id);


--
-- Name: werk_inbox_mailboxen werk_inbox_mailboxen_gebruiker_adres_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_mailboxen
    ADD CONSTRAINT werk_inbox_mailboxen_gebruiker_adres_uq UNIQUE (gebruiker_id, email_adres);


--
-- Name: werk_inbox_mailboxen werk_inbox_mailboxen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_mailboxen
    ADD CONSTRAINT werk_inbox_mailboxen_pkey PRIMARY KEY (id);


--
-- Name: werk_inbox_mails werk_inbox_mails_gebruiker_message_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_mails
    ADD CONSTRAINT werk_inbox_mails_gebruiker_message_uq UNIQUE (gebruiker_id, message_id);


--
-- Name: werk_inbox_mails werk_inbox_mails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_mails
    ADD CONSTRAINT werk_inbox_mails_pkey PRIMARY KEY (id);


--
-- Name: werk_inbox_notities werk_inbox_notities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_notities
    ADD CONSTRAINT werk_inbox_notities_pkey PRIMARY KEY (id);


--
-- Name: werk_inbox_tokens werk_inbox_tokens_gebruiker_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_tokens
    ADD CONSTRAINT werk_inbox_tokens_gebruiker_uq UNIQUE (gebruiker_id);


--
-- Name: werk_inbox_tokens werk_inbox_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_tokens
    ADD CONSTRAINT werk_inbox_tokens_pkey PRIMARY KEY (id);


--
-- Name: werkbegroting_adviezen werkbegroting_adviezen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbegroting_adviezen
    ADD CONSTRAINT werkbegroting_adviezen_pkey PRIMARY KEY (id);


--
-- Name: werkbegroting_regels werkbegroting_regels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbegroting_regels
    ADD CONSTRAINT werkbegroting_regels_pkey PRIMARY KEY (id);


--
-- Name: werkbonnen werkbonnen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbonnen
    ADD CONSTRAINT werkbonnen_pkey PRIMARY KEY (id);


--
-- Name: werkbonnen werkbonnen_werkbonnummer_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbonnen
    ADD CONSTRAINT werkbonnen_werkbonnummer_unique UNIQUE (werkbonnummer);


--
-- Name: werkgevers werkgevers_naam_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkgevers
    ADD CONSTRAINT werkgevers_naam_unique UNIQUE (naam);


--
-- Name: werkgevers werkgevers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkgevers
    ADD CONSTRAINT werkgevers_pkey PRIMARY KEY (id);


--
-- Name: workflow_cards workflow_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_cards
    ADD CONSTRAINT workflow_cards_pkey PRIMARY KEY (id);


--
-- Name: workflow_definities workflow_definities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_definities
    ADD CONSTRAINT workflow_definities_pkey PRIMARY KEY (id);


--
-- Name: workflow_lanes workflow_lanes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_lanes
    ADD CONSTRAINT workflow_lanes_pkey PRIMARY KEY (id);


--
-- Name: workflow_rechten workflow_rechten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_rechten
    ADD CONSTRAINT workflow_rechten_pkey PRIMARY KEY (id);


--
-- Name: workflow_transitie_log workflow_transitie_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_transitie_log
    ADD CONSTRAINT workflow_transitie_log_pkey PRIMARY KEY (id);


--
-- Name: ziekmeldingen ziekmeldingen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ziekmeldingen
    ADD CONSTRAINT ziekmeldingen_pkey PRIMARY KEY (id);


--
-- Name: zzp_overeenkomsten zzp_overeenkomsten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zzp_overeenkomsten
    ADD CONSTRAINT zzp_overeenkomsten_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: activiteiten_gebouw_tijdstip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activiteiten_gebouw_tijdstip_idx ON public.activiteiten USING btree (gebouw_id, tijdstip);


--
-- Name: audit_log_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_document_idx ON public.audit_log USING btree (document_id) WHERE (document_id IS NOT NULL);


--
-- Name: audit_log_entiteit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_entiteit_idx ON public.audit_log USING btree (entiteit, entiteit_id);


--
-- Name: audit_log_gebouw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_gebouw_idx ON public.audit_log USING btree (gebouw_id) WHERE (gebouw_id IS NOT NULL);


--
-- Name: audit_log_gebruiker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_gebruiker_idx ON public.audit_log USING btree (gebruiker_id);


--
-- Name: audit_log_medewerker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_medewerker_idx ON public.audit_log USING btree (medewerker_id) WHERE (medewerker_id IS NOT NULL);


--
-- Name: audit_log_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_module_idx ON public.audit_log USING btree (module);


--
-- Name: audit_log_tijdstip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_tijdstip_idx ON public.audit_log USING btree (tijdstip);


--
-- Name: chat_berichten_gesprek_aangemaakt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_berichten_gesprek_aangemaakt_idx ON public.chat_berichten USING btree (gesprek_id, aangemaakt_op);


--
-- Name: compliance_signalen_dedup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_signalen_dedup_idx ON public.compliance_signalen USING btree (dedup_sleutel);


--
-- Name: compliance_signalen_regel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_signalen_regel_idx ON public.compliance_signalen USING btree (regel);


--
-- Name: compliance_signalen_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_signalen_status_idx ON public.compliance_signalen USING btree (status);


--
-- Name: dcc_wm_datum_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dcc_wm_datum_idx ON public.document_classificatie_correcties USING btree (werkmaatschappij, aangemaakt_op DESC);


--
-- Name: document_koppelingen_doel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_koppelingen_doel_idx ON public.document_koppelingen USING btree (doel_type, doel_id);


--
-- Name: document_studio_modellen_actief_uniek; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_studio_modellen_actief_uniek ON public.document_studio_modellen USING btree (werkgever_id, document_type) WHERE (status = 'goedgekeurd'::text);


--
-- Name: factuur_signalen_open_factuur_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX factuur_signalen_open_factuur_uq ON public.factuur_signalen USING btree (type, factuur_id) WHERE ((status = 'open'::text) AND (factuur_id IS NOT NULL));


--
-- Name: factuur_signalen_open_kans_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX factuur_signalen_open_kans_uq ON public.factuur_signalen USING btree (type, projectkans_id) WHERE ((status = 'open'::text) AND (factuur_id IS NULL) AND (projectkans_id IS NOT NULL));


--
-- Name: factuur_signalen_open_mail_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX factuur_signalen_open_mail_uq ON public.factuur_signalen USING btree (type, mail_message_id) WHERE ((status = 'open'::text) AND (factuur_id IS NULL) AND (projectkans_id IS NULL) AND (mail_message_id IS NOT NULL));


--
-- Name: financiele_document_log_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financiele_document_log_document_idx ON public.financiele_document_log USING btree (document_id);


--
-- Name: financiele_documenten_entiteit_jaar_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financiele_documenten_entiteit_jaar_idx ON public.financiele_documenten USING btree (entiteit, boekjaar, subtype);


--
-- Name: financiele_kerncijfers_document_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financiele_kerncijfers_document_idx ON public.financiele_kerncijfers USING btree (document_id);


--
-- Name: financiele_kerncijfers_meerjaren_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX financiele_kerncijfers_meerjaren_idx ON public.financiele_kerncijfers USING btree (entiteit, geconsolideerd, sleutel, status);


--
-- Name: gebruiker_profielen_gebruiker_id_profiel_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX gebruiker_profielen_gebruiker_id_profiel_id_unique ON public.gebruiker_profielen USING btree (gebruiker_id, profiel_id);


--
-- Name: goedkeuring_aanvragen_documenttype_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goedkeuring_aanvragen_documenttype_idx ON public.goedkeuring_aanvragen USING btree (document_type);


--
-- Name: goedkeuring_aanvragen_object_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goedkeuring_aanvragen_object_idx ON public.goedkeuring_aanvragen USING btree (object_type, object_id);


--
-- Name: goedkeuring_aanvragen_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goedkeuring_aanvragen_status_idx ON public.goedkeuring_aanvragen USING btree (status);


--
-- Name: goedkeuring_beleidsregels_documenttype_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goedkeuring_beleidsregels_documenttype_idx ON public.goedkeuring_beleidsregels USING btree (document_type);


--
-- Name: goedkeuring_escalaties_aanvraag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goedkeuring_escalaties_aanvraag_idx ON public.goedkeuring_escalaties USING btree (aanvraag_id);


--
-- Name: goedkeuring_stappen_aanvraag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX goedkeuring_stappen_aanvraag_idx ON public.goedkeuring_stappen USING btree (aanvraag_id);


--
-- Name: gp_gebruiker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gp_gebruiker_idx ON public.gebruiker_profielen USING btree (gebruiker_id);


--
-- Name: gp_profiel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gp_profiel_idx ON public.gebruiker_profielen USING btree (profiel_id);


--
-- Name: idx_fps_visuals_spot_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fps_visuals_spot_type ON public.fps_visuals USING gin (spot_type);


--
-- Name: idx_fps_visuals_visual_type_actief; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fps_visuals_visual_type_actief ON public.fps_visuals USING btree (visual_type, actief);


--
-- Name: idx_lev_prestaties_leverancier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lev_prestaties_leverancier ON public.leverancier_prestaties USING btree (leverancier_id);


--
-- Name: idx_offerte_tracking_offerte; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offerte_tracking_offerte ON public.offerte_tracking USING btree (offerte_id);


--
-- Name: idx_portaal_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portaal_tokens_token ON public.offerte_portaal_tokens USING btree (token);


--
-- Name: idx_vge_log_visual_spot_stap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vge_log_visual_spot_stap ON public.vge_effectiviteitslog USING btree (visual_id, spot_type, stap_type);


--
-- Name: inspecties_gebouw_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inspecties_gebouw_type_idx ON public.inspecties USING btree (gebouw_id, type);


--
-- Name: medewerkers_gebruiker_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX medewerkers_gebruiker_id_unique ON public.medewerkers USING btree (gebruiker_id);


--
-- Name: object_rechten_gebruiker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX object_rechten_gebruiker_idx ON public.object_rechten USING btree (gebruiker_id);


--
-- Name: object_rechten_geldig_tot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX object_rechten_geldig_tot_idx ON public.object_rechten USING btree (geldig_tot);


--
-- Name: object_rechten_object_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX object_rechten_object_idx ON public.object_rechten USING btree (object_type, object_id);


--
-- Name: onderhoud_gebouw_status_deadline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX onderhoud_gebouw_status_deadline_idx ON public.onderhoud USING btree (gebouw_id, status, deadline);


--
-- Name: uq_handtekeningen_offerte; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_handtekeningen_offerte ON public.offerte_handtekeningen USING btree (offerte_id);


--
-- Name: uq_offertes_auto_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_offertes_auto_project_id ON public.offertes USING btree (auto_project_id);


--
-- Name: voorzieningen_gebouw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voorzieningen_gebouw_idx ON public.voorzieningen USING btree (gebouw_id);


--
-- Name: werk_inbox_koppelingen_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX werk_inbox_koppelingen_message_idx ON public.werk_inbox_koppelingen USING btree (message_id, gebruiker_id);


--
-- Name: werk_inbox_mailboxen_gebruiker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX werk_inbox_mailboxen_gebruiker_idx ON public.werk_inbox_mailboxen USING btree (gebruiker_id);


--
-- Name: werk_inbox_mails_gebruiker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX werk_inbox_mails_gebruiker_idx ON public.werk_inbox_mails USING btree (gebruiker_id);


--
-- Name: werk_inbox_mails_mailbox_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX werk_inbox_mails_mailbox_idx ON public.werk_inbox_mails USING btree (gebruiker_id, mailbox_adres);


--
-- Name: werk_inbox_mails_ontvangen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX werk_inbox_mails_ontvangen_idx ON public.werk_inbox_mails USING btree (gebruiker_id, ontvangen_op);


--
-- Name: werk_inbox_notities_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX werk_inbox_notities_message_idx ON public.werk_inbox_notities USING btree (message_id, gebruiker_id);


--
-- Name: workflow_rechten_module_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workflow_rechten_module_status_idx ON public.workflow_rechten USING btree (module_id, workflow_status);


--
-- Name: wrt_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wrt_token_idx ON public.wachtwoord_reset_tokens USING btree (token);


--
-- Name: aanvraag_planningen aanvraag_planningen_inbox_item_id_inbox_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_planningen
    ADD CONSTRAINT aanvraag_planningen_inbox_item_id_inbox_items_id_fk FOREIGN KEY (inbox_item_id) REFERENCES public.inbox_items(id) ON DELETE CASCADE;


--
-- Name: aanvraag_voorstellen aanvraag_voorstellen_beoordeeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_voorstellen
    ADD CONSTRAINT aanvraag_voorstellen_beoordeeld_door_id_gebruikers_id_fk FOREIGN KEY (beoordeeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: aanvraag_voorstellen aanvraag_voorstellen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_voorstellen
    ADD CONSTRAINT aanvraag_voorstellen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: aanvraag_voorstellen aanvraag_voorstellen_projectkans_id_crm_commercieel_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aanvraag_voorstellen
    ADD CONSTRAINT aanvraag_voorstellen_projectkans_id_crm_commercieel_id_fk FOREIGN KEY (projectkans_id) REFERENCES public.crm_commercieel(id) ON DELETE SET NULL;


--
-- Name: accountview_export_logs accountview_export_logs_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_export_logs
    ADD CONSTRAINT accountview_export_logs_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE CASCADE;


--
-- Name: accountview_export_logs accountview_export_logs_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accountview_export_logs
    ADD CONSTRAINT accountview_export_logs_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: app_instellingen app_instellingen_bijgewerkt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_instellingen
    ADD CONSTRAINT app_instellingen_bijgewerkt_door_id_gebruikers_id_fk FOREIGN KEY (bijgewerkt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: arbeidsovereenkomsten arbeidsovereenkomsten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arbeidsovereenkomsten
    ADD CONSTRAINT arbeidsovereenkomsten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: arbeidsovereenkomsten arbeidsovereenkomsten_functie_id_functies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arbeidsovereenkomsten
    ADD CONSTRAINT arbeidsovereenkomsten_functie_id_functies_id_fk FOREIGN KEY (functie_id) REFERENCES public.functies(id) ON DELETE SET NULL;


--
-- Name: arbeidsovereenkomsten arbeidsovereenkomsten_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arbeidsovereenkomsten
    ADD CONSTRAINT arbeidsovereenkomsten_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: arbeidsovereenkomsten arbeidsovereenkomsten_ondertekend_door_hr_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arbeidsovereenkomsten
    ADD CONSTRAINT arbeidsovereenkomsten_ondertekend_door_hr_id_gebruikers_id_fk FOREIGN KEY (ondertekend_door_hr_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: arbeidsovereenkomsten arbeidsovereenkomsten_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arbeidsovereenkomsten
    ADD CONSTRAINT arbeidsovereenkomsten_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: artikelen artikelen_leverancier_id_leveranciers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artikelen
    ADD CONSTRAINT artikelen_leverancier_id_leveranciers_id_fk FOREIGN KEY (leverancier_id) REFERENCES public.leveranciers(id) ON DELETE SET NULL;


--
-- Name: avg_inzageverzoeken avg_inzageverzoeken_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avg_inzageverzoeken
    ADD CONSTRAINT avg_inzageverzoeken_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: backup_records backup_records_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_records
    ADD CONSTRAINT backup_records_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: bedrijfssluitingen bedrijfssluitingen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bedrijfssluitingen
    ADD CONSTRAINT bedrijfssluitingen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: bekwaamheden bekwaamheden_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bekwaamheden
    ADD CONSTRAINT bekwaamheden_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: boekhouder_uploads boekhouder_uploads_uploader_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boekhouder_uploads
    ADD CONSTRAINT boekhouder_uploads_uploader_id_gebruikers_id_fk FOREIGN KEY (uploader_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: boekhouder_uploads boekhouder_uploads_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boekhouder_uploads
    ADD CONSTRAINT boekhouder_uploads_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: brandstof_importen brandstof_importen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_importen
    ADD CONSTRAINT brandstof_importen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: brandstof_importen brandstof_importen_geladen_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_importen
    ADD CONSTRAINT brandstof_importen_geladen_door_id_gebruikers_id_fk FOREIGN KEY (geladen_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: brandstof_importen brandstof_importen_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_importen
    ADD CONSTRAINT brandstof_importen_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: brandstof_regels brandstof_regels_import_id_brandstof_importen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_regels
    ADD CONSTRAINT brandstof_regels_import_id_brandstof_importen_id_fk FOREIGN KEY (import_id) REFERENCES public.brandstof_importen(id) ON DELETE CASCADE;


--
-- Name: brandstof_regels brandstof_regels_voertuig_id_voertuigen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brandstof_regels
    ADD CONSTRAINT brandstof_regels_voertuig_id_voertuigen_id_fk FOREIGN KEY (voertuig_id) REFERENCES public.voertuigen(id) ON DELETE SET NULL;


--
-- Name: bruikleen_overeenkomsten bruikleen_overeenkomsten_gereedschap_id_gereedschappen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bruikleen_overeenkomsten
    ADD CONSTRAINT bruikleen_overeenkomsten_gereedschap_id_gereedschappen_id_fk FOREIGN KEY (gereedschap_id) REFERENCES public.gereedschappen(id) ON DELETE CASCADE;


--
-- Name: bruikleen_overeenkomsten bruikleen_overeenkomsten_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bruikleen_overeenkomsten
    ADD CONSTRAINT bruikleen_overeenkomsten_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE RESTRICT;


--
-- Name: bruikleen_overeenkomsten bruikleen_overeenkomsten_uitgegever_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bruikleen_overeenkomsten
    ADD CONSTRAINT bruikleen_overeenkomsten_uitgegever_door_id_gebruikers_id_fk FOREIGN KEY (uitgegever_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: calculatie_regels calculatie_regels_calculatie_id_calculaties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calculatie_regels
    ADD CONSTRAINT calculatie_regels_calculatie_id_calculaties_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.calculaties(id) ON DELETE CASCADE;


--
-- Name: calculaties calculaties_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calculaties
    ADD CONSTRAINT calculaties_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: calculaties calculaties_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calculaties
    ADD CONSTRAINT calculaties_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: chat_berichten chat_berichten_afzender_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_berichten
    ADD CONSTRAINT chat_berichten_afzender_id_gebruikers_id_fk FOREIGN KEY (afzender_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: chat_berichten chat_berichten_gesprek_id_chat_gesprekken_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_berichten
    ADD CONSTRAINT chat_berichten_gesprek_id_chat_gesprekken_id_fk FOREIGN KEY (gesprek_id) REFERENCES public.chat_gesprekken(id) ON DELETE CASCADE;


--
-- Name: chat_deelnemers chat_deelnemers_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_deelnemers
    ADD CONSTRAINT chat_deelnemers_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: chat_deelnemers chat_deelnemers_gesprek_id_chat_gesprekken_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_deelnemers
    ADD CONSTRAINT chat_deelnemers_gesprek_id_chat_gesprekken_id_fk FOREIGN KEY (gesprek_id) REFERENCES public.chat_gesprekken(id) ON DELETE CASCADE;


--
-- Name: chat_gesprekken chat_gesprekken_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_gesprekken
    ADD CONSTRAINT chat_gesprekken_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: clusters clusters_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clusters
    ADD CONSTRAINT clusters_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: clusters clusters_verdieping_id_verdiepingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clusters
    ADD CONSTRAINT clusters_verdieping_id_verdiepingen_id_fk FOREIGN KEY (verdieping_id) REFERENCES public.verdiepingen(id) ON DELETE SET NULL;


--
-- Name: constructie_templates constructie_templates_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.constructie_templates
    ADD CONSTRAINT constructie_templates_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: contract_besluiten contract_besluiten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_besluiten
    ADD CONSTRAINT contract_besluiten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: contract_besluiten contract_besluiten_besloten_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_besluiten
    ADD CONSTRAINT contract_besluiten_besloten_door_id_gebruikers_id_fk FOREIGN KEY (besloten_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: contract_besluiten contract_besluiten_contract_id_arbeidsovereenkomsten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_besluiten
    ADD CONSTRAINT contract_besluiten_contract_id_arbeidsovereenkomsten_id_fk FOREIGN KEY (contract_id) REFERENCES public.arbeidsovereenkomsten(id) ON DELETE CASCADE;


--
-- Name: contract_besluiten contract_besluiten_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_besluiten
    ADD CONSTRAINT contract_besluiten_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: contract_signaleringen contract_signaleringen_contract_id_arbeidsovereenkomsten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_signaleringen
    ADD CONSTRAINT contract_signaleringen_contract_id_arbeidsovereenkomsten_id_fk FOREIGN KEY (contract_id) REFERENCES public.arbeidsovereenkomsten(id) ON DELETE CASCADE;


--
-- Name: contract_signaleringen contract_signaleringen_gezien_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_signaleringen
    ADD CONSTRAINT contract_signaleringen_gezien_door_id_gebruikers_id_fk FOREIGN KEY (gezien_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: contract_signaleringen contract_signaleringen_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_signaleringen
    ADD CONSTRAINT contract_signaleringen_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: cqo_bevindingen cqo_bevindingen_run_id_cqo_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cqo_bevindingen
    ADD CONSTRAINT cqo_bevindingen_run_id_cqo_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.cqo_runs(id) ON DELETE CASCADE;


--
-- Name: cqo_verbeterpunten cqo_verbeterpunten_run_id_cqo_runs_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cqo_verbeterpunten
    ADD CONSTRAINT cqo_verbeterpunten_run_id_cqo_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.cqo_runs(id) ON DELETE CASCADE;


--
-- Name: crm_commercieel crm_commercieel_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_commercieel
    ADD CONSTRAINT crm_commercieel_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: crm_commercieel crm_commercieel_klant_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_commercieel
    ADD CONSTRAINT crm_commercieel_klant_id_crm_klanten_id_fk FOREIGN KEY (klant_id) REFERENCES public.crm_klanten(id) ON DELETE CASCADE;


--
-- Name: crm_commercieel crm_commercieel_verantwoordelijke_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_commercieel
    ADD CONSTRAINT crm_commercieel_verantwoordelijke_id_gebruikers_id_fk FOREIGN KEY (verantwoordelijke_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: crm_communicatie crm_communicatie_contactpersoon_id_crm_contactpersonen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communicatie
    ADD CONSTRAINT crm_communicatie_contactpersoon_id_crm_contactpersonen_id_fk FOREIGN KEY (contactpersoon_id) REFERENCES public.crm_contactpersonen(id) ON DELETE SET NULL;


--
-- Name: crm_communicatie crm_communicatie_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communicatie
    ADD CONSTRAINT crm_communicatie_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: crm_communicatie crm_communicatie_klant_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_communicatie
    ADD CONSTRAINT crm_communicatie_klant_id_crm_klanten_id_fk FOREIGN KEY (klant_id) REFERENCES public.crm_klanten(id) ON DELETE CASCADE;


--
-- Name: crm_contactpersonen crm_contactpersonen_klant_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_contactpersonen
    ADD CONSTRAINT crm_contactpersonen_klant_id_crm_klanten_id_fk FOREIGN KEY (klant_id) REFERENCES public.crm_klanten(id) ON DELETE CASCADE;


--
-- Name: crm_financieel crm_financieel_klant_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_financieel
    ADD CONSTRAINT crm_financieel_klant_id_crm_klanten_id_fk FOREIGN KEY (klant_id) REFERENCES public.crm_klanten(id) ON DELETE CASCADE;


--
-- Name: crm_marktintelligentie crm_marktintelligentie_aangemaakt_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marktintelligentie
    ADD CONSTRAINT crm_marktintelligentie_aangemaakt_door_gebruikers_id_fk FOREIGN KEY (aangemaakt_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: crm_marktintelligentie crm_marktintelligentie_concurrent_id_crm_concurrenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marktintelligentie
    ADD CONSTRAINT crm_marktintelligentie_concurrent_id_crm_concurrenten_id_fk FOREIGN KEY (concurrent_id) REFERENCES public.crm_concurrenten(id) ON DELETE SET NULL;


--
-- Name: crm_marktintelligentie crm_marktintelligentie_organisatie_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_marktintelligentie
    ADD CONSTRAINT crm_marktintelligentie_organisatie_id_crm_klanten_id_fk FOREIGN KEY (organisatie_id) REFERENCES public.crm_klanten(id) ON DELETE SET NULL;


--
-- Name: crm_opdrachten crm_opdrachten_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_opdrachten
    ADD CONSTRAINT crm_opdrachten_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: crm_opdrachten crm_opdrachten_klant_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_opdrachten
    ADD CONSTRAINT crm_opdrachten_klant_id_crm_klanten_id_fk FOREIGN KEY (klant_id) REFERENCES public.crm_klanten(id) ON DELETE CASCADE;


--
-- Name: crm_relatievoorstellen crm_relatievoorstellen_beoordeeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_relatievoorstellen
    ADD CONSTRAINT crm_relatievoorstellen_beoordeeld_door_id_gebruikers_id_fk FOREIGN KEY (beoordeeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: crm_relatievoorstellen crm_relatievoorstellen_organisatie_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_relatievoorstellen
    ADD CONSTRAINT crm_relatievoorstellen_organisatie_id_crm_klanten_id_fk FOREIGN KEY (organisatie_id) REFERENCES public.crm_klanten(id) ON DELETE CASCADE;


--
-- Name: crm_taken crm_taken_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_taken
    ADD CONSTRAINT crm_taken_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: crm_taken crm_taken_toegewezen_aan_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_taken
    ADD CONSTRAINT crm_taken_toegewezen_aan_id_gebruikers_id_fk FOREIGN KEY (toegewezen_aan_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: document_goedkeuringen document_goedkeuringen_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_goedkeuringen
    ADD CONSTRAINT document_goedkeuringen_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE CASCADE;


--
-- Name: document_goedkeuringen document_goedkeuringen_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_goedkeuringen
    ADD CONSTRAINT document_goedkeuringen_door_id_gebruikers_id_fk FOREIGN KEY (door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: document_koppelingen document_koppelingen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_koppelingen
    ADD CONSTRAINT document_koppelingen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: document_koppelingen document_koppelingen_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_koppelingen
    ADD CONSTRAINT document_koppelingen_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE CASCADE;


--
-- Name: document_logboek document_logboek_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_logboek
    ADD CONSTRAINT document_logboek_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: document_logboek document_logboek_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_logboek
    ADD CONSTRAINT document_logboek_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: document_studio_modellen document_studio_modellen_aangemaakt_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_studio_modellen
    ADD CONSTRAINT document_studio_modellen_aangemaakt_door_gebruikers_id_fk FOREIGN KEY (aangemaakt_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: document_studio_modellen document_studio_modellen_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_studio_modellen
    ADD CONSTRAINT document_studio_modellen_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE CASCADE;


--
-- Name: document_toepassingen document_toepassingen_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_toepassingen
    ADD CONSTRAINT document_toepassingen_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE CASCADE;


--
-- Name: document_toepassingen document_toepassingen_label_id_labels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_toepassingen
    ADD CONSTRAINT document_toepassingen_label_id_labels_id_fk FOREIGN KEY (label_id) REFERENCES public.labels(id) ON DELETE CASCADE;


--
-- Name: dossier_documenten dossier_documenten_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_documenten
    ADD CONSTRAINT dossier_documenten_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: dossier_documenten dossier_documenten_dossier_id_dossiers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_documenten
    ADD CONSTRAINT dossier_documenten_dossier_id_dossiers_id_fk FOREIGN KEY (dossier_id) REFERENCES public.dossiers(id) ON DELETE CASCADE;


--
-- Name: dossier_documenten dossier_documenten_toegevoegd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossier_documenten
    ADD CONSTRAINT dossier_documenten_toegevoegd_door_id_gebruikers_id_fk FOREIGN KEY (toegevoegd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: dossiers dossiers_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: dossiers dossiers_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dossiers
    ADD CONSTRAINT dossiers_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_accordering_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_accordering_door_id_gebruikers_id_fk FOREIGN KEY (accordering_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_afgekeurd_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_afgekeurd_door_gebruikers_id_fk FOREIGN KEY (afgekeurd_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_beoordelaar_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_beoordelaar_id_gebruikers_id_fk FOREIGN KEY (beoordelaar_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_geaccordeerd_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_geaccordeerd_door_gebruikers_id_fk FOREIGN KEY (geaccordeerd_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_herexport_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_herexport_door_gebruikers_id_fk FOREIGN KEY (herexport_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_inkoper_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_inkoper_id_gebruikers_id_fk FOREIGN KEY (inkoper_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: facturen facturen_uploader_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facturen
    ADD CONSTRAINT facturen_uploader_id_gebruikers_id_fk FOREIGN KEY (uploader_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: factuur_correspondentie factuur_correspondentie_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_correspondentie
    ADD CONSTRAINT factuur_correspondentie_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE CASCADE;


--
-- Name: factuur_correspondentie factuur_correspondentie_opgesteld_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_correspondentie
    ADD CONSTRAINT factuur_correspondentie_opgesteld_door_gebruikers_id_fk FOREIGN KEY (opgesteld_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: factuur_correspondentie factuur_correspondentie_verzonden_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_correspondentie
    ADD CONSTRAINT factuur_correspondentie_verzonden_door_gebruikers_id_fk FOREIGN KEY (verzonden_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: factuur_herinneringen factuur_herinneringen_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_herinneringen
    ADD CONSTRAINT factuur_herinneringen_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE CASCADE;


--
-- Name: factuur_herinneringen factuur_herinneringen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_herinneringen
    ADD CONSTRAINT factuur_herinneringen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: factuur_import_log factuur_import_log_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_import_log
    ADD CONSTRAINT factuur_import_log_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE SET NULL;


--
-- Name: factuur_opmerkingen factuur_opmerkingen_afgehandeld_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_opmerkingen
    ADD CONSTRAINT factuur_opmerkingen_afgehandeld_door_gebruikers_id_fk FOREIGN KEY (afgehandeld_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: factuur_opmerkingen factuur_opmerkingen_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_opmerkingen
    ADD CONSTRAINT factuur_opmerkingen_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE CASCADE;


--
-- Name: factuur_opmerkingen factuur_opmerkingen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_opmerkingen
    ADD CONSTRAINT factuur_opmerkingen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: factuur_regels factuur_regels_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_regels
    ADD CONSTRAINT factuur_regels_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE CASCADE;


--
-- Name: factuur_signalen factuur_signalen_afgehandeld_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_signalen
    ADD CONSTRAINT factuur_signalen_afgehandeld_door_gebruikers_id_fk FOREIGN KEY (afgehandeld_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: factuur_signalen factuur_signalen_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_signalen
    ADD CONSTRAINT factuur_signalen_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE CASCADE;


--
-- Name: factuur_termijnen factuur_termijnen_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_termijnen
    ADD CONSTRAINT factuur_termijnen_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE SET NULL;


--
-- Name: factuur_termijnen factuur_termijnen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_termijnen
    ADD CONSTRAINT factuur_termijnen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: factuur_tijdlijn factuur_tijdlijn_factuur_id_facturen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factuur_tijdlijn
    ADD CONSTRAINT factuur_tijdlijn_factuur_id_facturen_id_fk FOREIGN KEY (factuur_id) REFERENCES public.facturen(id) ON DELETE CASCADE;


--
-- Name: feedback feedback_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: feestdagen feestdagen_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feestdagen
    ADD CONSTRAINT feestdagen_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: fie_ak_posten fie_ak_posten_begroting_id_fie_jaarbegrotingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_ak_posten
    ADD CONSTRAINT fie_ak_posten_begroting_id_fie_jaarbegrotingen_id_fk FOREIGN KEY (begroting_id) REFERENCES public.fie_jaarbegrotingen(id) ON DELETE CASCADE;


--
-- Name: fie_ak_posten fie_ak_posten_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_ak_posten
    ADD CONSTRAINT fie_ak_posten_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: fie_capaciteit_snapshots fie_capaciteit_snapshots_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fie_capaciteit_snapshots
    ADD CONSTRAINT fie_capaciteit_snapshots_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: financiele_contract_kosten financiele_contract_kosten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_kosten
    ADD CONSTRAINT financiele_contract_kosten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: financiele_contract_kosten financiele_contract_kosten_contract_id_financiele_contracten_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_kosten
    ADD CONSTRAINT financiele_contract_kosten_contract_id_financiele_contracten_id FOREIGN KEY (contract_id) REFERENCES public.financiele_contracten(id) ON DELETE CASCADE;


--
-- Name: financiele_contract_kosten financiele_contract_kosten_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_kosten
    ADD CONSTRAINT financiele_contract_kosten_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: financiele_contract_signaleringen financiele_contract_signaleringen_contract_id_financiele_contra; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_signaleringen
    ADD CONSTRAINT financiele_contract_signaleringen_contract_id_financiele_contra FOREIGN KEY (contract_id) REFERENCES public.financiele_contracten(id) ON DELETE CASCADE;


--
-- Name: financiele_contract_signaleringen financiele_contract_signaleringen_gezien_door_id_gebruikers_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contract_signaleringen
    ADD CONSTRAINT financiele_contract_signaleringen_gezien_door_id_gebruikers_id_ FOREIGN KEY (gezien_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: financiele_contracten financiele_contracten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contracten
    ADD CONSTRAINT financiele_contracten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: financiele_contracten financiele_contracten_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contracten
    ADD CONSTRAINT financiele_contracten_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: financiele_contracten financiele_contracten_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_contracten
    ADD CONSTRAINT financiele_contracten_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: financiele_document_log financiele_document_log_document_id_financiele_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_document_log
    ADD CONSTRAINT financiele_document_log_document_id_financiele_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.financiele_documenten(id) ON DELETE CASCADE;


--
-- Name: financiele_document_log financiele_document_log_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_document_log
    ADD CONSTRAINT financiele_document_log_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: financiele_documenten financiele_documenten_geupload_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_documenten
    ADD CONSTRAINT financiele_documenten_geupload_door_gebruikers_id_fk FOREIGN KEY (geupload_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: financiele_documenten financiele_documenten_goedgekeurd_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_documenten
    ADD CONSTRAINT financiele_documenten_goedgekeurd_door_gebruikers_id_fk FOREIGN KEY (goedgekeurd_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: financiele_kerncijfers financiele_kerncijfers_beoordeeld_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_kerncijfers
    ADD CONSTRAINT financiele_kerncijfers_beoordeeld_door_gebruikers_id_fk FOREIGN KEY (beoordeeld_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: financiele_kerncijfers financiele_kerncijfers_document_id_financiele_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financiele_kerncijfers
    ADD CONSTRAINT financiele_kerncijfers_document_id_financiele_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.financiele_documenten(id) ON DELETE CASCADE;


--
-- Name: fotos fotos_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fotos
    ADD CONSTRAINT fotos_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE CASCADE;


--
-- Name: fps_visuals fps_visuals_artikel_id_artikelen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_visuals
    ADD CONSTRAINT fps_visuals_artikel_id_artikelen_id_fk FOREIGN KEY (artikel_id) REFERENCES public.artikelen(id) ON DELETE SET NULL;


--
-- Name: fps_visuals fps_visuals_bedrijfsstandaard_id_fps_bedrijfsstandaarden_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fps_visuals
    ADD CONSTRAINT fps_visuals_bedrijfsstandaard_id_fps_bedrijfsstandaarden_id_fk FOREIGN KEY (bedrijfsstandaard_id) REFERENCES public.fps_bedrijfsstandaarden(id) ON DELETE SET NULL;


--
-- Name: functie_opleidingen functie_opleidingen_functie_id_functies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.functie_opleidingen
    ADD CONSTRAINT functie_opleidingen_functie_id_functies_id_fk FOREIGN KEY (functie_id) REFERENCES public.functies(id) ON DELETE CASCADE;


--
-- Name: functie_opleidingen functie_opleidingen_opleiding_id_opleidingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.functie_opleidingen
    ADD CONSTRAINT functie_opleidingen_opleiding_id_opleidingen_id_fk FOREIGN KEY (opleiding_id) REFERENCES public.opleidingen(id) ON DELETE CASCADE;


--
-- Name: functies functies_profiel_id_profielen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.functies
    ADD CONSTRAINT functies_profiel_id_profielen_id_fk FOREIGN KEY (profiel_id) REFERENCES public.profielen(id) ON DELETE SET NULL;


--
-- Name: functies functies_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.functies
    ADD CONSTRAINT functies_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: gebouw_email_bijlagen gebouw_email_bijlagen_email_id_gebouw_emails_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_email_bijlagen
    ADD CONSTRAINT gebouw_email_bijlagen_email_id_gebouw_emails_id_fk FOREIGN KEY (email_id) REFERENCES public.gebouw_emails(id) ON DELETE CASCADE;


--
-- Name: gebouw_email_samenvattingen gebouw_email_samenvattingen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_email_samenvattingen
    ADD CONSTRAINT gebouw_email_samenvattingen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: gebouw_emails gebouw_emails_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_emails
    ADD CONSTRAINT gebouw_emails_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: gebouw_partijen gebouw_partijen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_partijen
    ADD CONSTRAINT gebouw_partijen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: gebouw_publicaties gebouw_publicaties_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_publicaties
    ADD CONSTRAINT gebouw_publicaties_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: gebouw_publicaties gebouw_publicaties_gepubliceerd_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_publicaties
    ADD CONSTRAINT gebouw_publicaties_gepubliceerd_door_gebruikers_id_fk FOREIGN KEY (gepubliceerd_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: gebouw_publicaties gebouw_publicaties_ingetrokken_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_publicaties
    ADD CONSTRAINT gebouw_publicaties_ingetrokken_door_gebruikers_id_fk FOREIGN KEY (ingetrokken_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: gebouw_toewijzingen gebouw_toewijzingen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_toewijzingen
    ADD CONSTRAINT gebouw_toewijzingen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: gebouw_toewijzingen gebouw_toewijzingen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_toewijzingen
    ADD CONSTRAINT gebouw_toewijzingen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: gebouw_toewijzingen gebouw_toewijzingen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouw_toewijzingen
    ADD CONSTRAINT gebouw_toewijzingen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: gebouwen gebouwen_klant_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouwen
    ADD CONSTRAINT gebouwen_klant_id_gebruikers_id_fk FOREIGN KEY (klant_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: gebouwen gebouwen_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebouwen
    ADD CONSTRAINT gebouwen_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: gebruiker_profielen gebruiker_profielen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruiker_profielen
    ADD CONSTRAINT gebruiker_profielen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: gebruiker_profielen gebruiker_profielen_profiel_id_profielen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruiker_profielen
    ADD CONSTRAINT gebruiker_profielen_profiel_id_profielen_id_fk FOREIGN KEY (profiel_id) REFERENCES public.profielen(id) ON DELETE CASCADE;


--
-- Name: gebruikers gebruikers_herkomst_profiel_id_profielen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gebruikers
    ADD CONSTRAINT gebruikers_herkomst_profiel_id_profielen_id_fk FOREIGN KEY (herkomst_profiel_id) REFERENCES public.profielen(id) ON DELETE SET NULL;


--
-- Name: gereedschap_meldingen gereedschap_meldingen_gemeld_door_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschap_meldingen
    ADD CONSTRAINT gereedschap_meldingen_gemeld_door_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gemeld_door_gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: gereedschap_meldingen gereedschap_meldingen_gemeld_door_medewerker_id_medewerkers_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschap_meldingen
    ADD CONSTRAINT gereedschap_meldingen_gemeld_door_medewerker_id_medewerkers_id_ FOREIGN KEY (gemeld_door_medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: gereedschap_meldingen gereedschap_meldingen_gereedschap_id_gereedschappen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschap_meldingen
    ADD CONSTRAINT gereedschap_meldingen_gereedschap_id_gereedschappen_id_fk FOREIGN KEY (gereedschap_id) REFERENCES public.gereedschappen(id) ON DELETE CASCADE;


--
-- Name: gereedschappen gereedschappen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschappen
    ADD CONSTRAINT gereedschappen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: gereedschappen gereedschappen_huidige_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gereedschappen
    ADD CONSTRAINT gereedschappen_huidige_medewerker_id_medewerkers_id_fk FOREIGN KEY (huidige_medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_aanvragen goedkeuring_aanvragen_beleidsregel_id_goedkeuring_beleidsregels; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_aanvragen
    ADD CONSTRAINT goedkeuring_aanvragen_beleidsregel_id_goedkeuring_beleidsregels FOREIGN KEY (beleidsregel_id) REFERENCES public.goedkeuring_beleidsregels(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_aanvragen goedkeuring_aanvragen_ingediend_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_aanvragen
    ADD CONSTRAINT goedkeuring_aanvragen_ingediend_door_id_gebruikers_id_fk FOREIGN KEY (ingediend_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_beleidsregels goedkeuring_beleidsregels_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_beleidsregels
    ADD CONSTRAINT goedkeuring_beleidsregels_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_beleidsregels goedkeuring_beleidsregels_escalatie_stap_1_gebruiker_id_gebruik; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_beleidsregels
    ADD CONSTRAINT goedkeuring_beleidsregels_escalatie_stap_1_gebruiker_id_gebruik FOREIGN KEY (escalatie_stap_1_gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_beleidsregels goedkeuring_beleidsregels_escalatie_stap_2_gebruiker_id_gebruik; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_beleidsregels
    ADD CONSTRAINT goedkeuring_beleidsregels_escalatie_stap_2_gebruiker_id_gebruik FOREIGN KEY (escalatie_stap_2_gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_beleidsregels goedkeuring_beleidsregels_goedkeurder_gebruiker_id_gebruikers_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_beleidsregels
    ADD CONSTRAINT goedkeuring_beleidsregels_goedkeurder_gebruiker_id_gebruikers_i FOREIGN KEY (goedkeurder_gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_beleidsregels goedkeuring_beleidsregels_vervanger_gebruiker_id_gebruikers_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_beleidsregels
    ADD CONSTRAINT goedkeuring_beleidsregels_vervanger_gebruiker_id_gebruikers_id_ FOREIGN KEY (vervanger_gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_escalaties goedkeuring_escalaties_aanvraag_id_goedkeuring_aanvragen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_escalaties
    ADD CONSTRAINT goedkeuring_escalaties_aanvraag_id_goedkeuring_aanvragen_id_fk FOREIGN KEY (aanvraag_id) REFERENCES public.goedkeuring_aanvragen(id) ON DELETE CASCADE;


--
-- Name: goedkeuring_escalaties goedkeuring_escalaties_naar_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_escalaties
    ADD CONSTRAINT goedkeuring_escalaties_naar_gebruiker_id_gebruikers_id_fk FOREIGN KEY (naar_gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: goedkeuring_stappen goedkeuring_stappen_aanvraag_id_goedkeuring_aanvragen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_stappen
    ADD CONSTRAINT goedkeuring_stappen_aanvraag_id_goedkeuring_aanvragen_id_fk FOREIGN KEY (aanvraag_id) REFERENCES public.goedkeuring_aanvragen(id) ON DELETE CASCADE;


--
-- Name: goedkeuring_stappen goedkeuring_stappen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goedkeuring_stappen
    ADD CONSTRAINT goedkeuring_stappen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: governance_wachtrij governance_wachtrij_check_id_governance_checks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_wachtrij
    ADD CONSTRAINT governance_wachtrij_check_id_governance_checks_id_fk FOREIGN KEY (check_id) REFERENCES public.governance_checks(id) ON DELETE CASCADE;


--
-- Name: helpdesk_tickets helpdesk_tickets_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.helpdesk_tickets
    ADD CONSTRAINT helpdesk_tickets_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: hrm_ai_voorstellen hrm_ai_voorstellen_beoordeeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_ai_voorstellen
    ADD CONSTRAINT hrm_ai_voorstellen_beoordeeld_door_id_gebruikers_id_fk FOREIGN KEY (beoordeeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: hrm_ai_voorstellen hrm_ai_voorstellen_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_ai_voorstellen
    ADD CONSTRAINT hrm_ai_voorstellen_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: hrm_ai_voorstellen hrm_ai_voorstellen_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_ai_voorstellen
    ADD CONSTRAINT hrm_ai_voorstellen_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: hrm_middelen hrm_middelen_aangevraagd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_middelen
    ADD CONSTRAINT hrm_middelen_aangevraagd_door_id_gebruikers_id_fk FOREIGN KEY (aangevraagd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: hrm_middelen hrm_middelen_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_middelen
    ADD CONSTRAINT hrm_middelen_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: hrm_onboarding_taken hrm_onboarding_taken_bewijs_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_onboarding_taken
    ADD CONSTRAINT hrm_onboarding_taken_bewijs_document_id_documenten_id_fk FOREIGN KEY (bewijs_document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: hrm_onboarding_taken hrm_onboarding_taken_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_onboarding_taken
    ADD CONSTRAINT hrm_onboarding_taken_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: hrm_onboarding_taken hrm_onboarding_taken_verantwoordelijke_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hrm_onboarding_taken
    ADD CONSTRAINT hrm_onboarding_taken_verantwoordelijke_id_gebruikers_id_fk FOREIGN KEY (verantwoordelijke_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: inbox_audit_log inbox_audit_log_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_audit_log
    ADD CONSTRAINT inbox_audit_log_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: inbox_audit_log inbox_audit_log_inbox_item_id_inbox_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_audit_log
    ADD CONSTRAINT inbox_audit_log_inbox_item_id_inbox_items_id_fk FOREIGN KEY (inbox_item_id) REFERENCES public.inbox_items(id) ON DELETE CASCADE;


--
-- Name: inbox_items inbox_items_geupload_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_geupload_door_gebruikers_id_fk FOREIGN KEY (geupload_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: inbox_items inbox_items_goedgekeurd_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_items
    ADD CONSTRAINT inbox_items_goedgekeurd_door_gebruikers_id_fk FOREIGN KEY (goedgekeurd_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: inkoopbon_regels inkoopbon_regels_inkoopbon_id_inkoopbonnen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbon_regels
    ADD CONSTRAINT inkoopbon_regels_inkoopbon_id_inkoopbonnen_id_fk FOREIGN KEY (inkoopbon_id) REFERENCES public.inkoopbonnen(id) ON DELETE CASCADE;


--
-- Name: inkoopbon_regels inkoopbon_regels_inkoopplan_regel_id_inkoopplan_regels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbon_regels
    ADD CONSTRAINT inkoopbon_regels_inkoopplan_regel_id_inkoopplan_regels_id_fk FOREIGN KEY (inkoopplan_regel_id) REFERENCES public.inkoopplan_regels(id) ON DELETE SET NULL;


--
-- Name: inkoopbonnen inkoopbonnen_goedgekeurd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbonnen
    ADD CONSTRAINT inkoopbonnen_goedgekeurd_door_id_gebruikers_id_fk FOREIGN KEY (goedgekeurd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: inkoopbonnen inkoopbonnen_inkoopplan_id_inkoopplannen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbonnen
    ADD CONSTRAINT inkoopbonnen_inkoopplan_id_inkoopplannen_id_fk FOREIGN KEY (inkoopplan_id) REFERENCES public.inkoopplannen(id) ON DELETE SET NULL;


--
-- Name: inkoopbonnen inkoopbonnen_leverancier_id_leveranciers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbonnen
    ADD CONSTRAINT inkoopbonnen_leverancier_id_leveranciers_id_fk FOREIGN KEY (leverancier_id) REFERENCES public.leveranciers(id) ON DELETE SET NULL;


--
-- Name: inkoopbonnen inkoopbonnen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopbonnen
    ADD CONSTRAINT inkoopbonnen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: inkoopplan_regels inkoopplan_regels_inkoopplan_id_inkoopplannen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopplan_regels
    ADD CONSTRAINT inkoopplan_regels_inkoopplan_id_inkoopplannen_id_fk FOREIGN KEY (inkoopplan_id) REFERENCES public.inkoopplannen(id) ON DELETE CASCADE;


--
-- Name: inkoopplan_regels inkoopplan_regels_werkbegroting_regel_id_werkbegroting_regels_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopplan_regels
    ADD CONSTRAINT inkoopplan_regels_werkbegroting_regel_id_werkbegroting_regels_i FOREIGN KEY (werkbegroting_regel_id) REFERENCES public.werkbegroting_regels(id) ON DELETE SET NULL;


--
-- Name: inkoopplannen inkoopplannen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopplannen
    ADD CONSTRAINT inkoopplannen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: inkoopplannen inkoopplannen_vastgesteld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inkoopplannen
    ADD CONSTRAINT inkoopplannen_vastgesteld_door_id_gebruikers_id_fk FOREIGN KEY (vastgesteld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: inspectie_bevindingen inspectie_bevindingen_herstel_werkbon_id_onderhoud_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspectie_bevindingen
    ADD CONSTRAINT inspectie_bevindingen_herstel_werkbon_id_onderhoud_id_fk FOREIGN KEY (herstel_werkbon_id) REFERENCES public.onderhoud(id) ON DELETE SET NULL;


--
-- Name: inspectie_bevindingen inspectie_bevindingen_inspectie_id_inspecties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspectie_bevindingen
    ADD CONSTRAINT inspectie_bevindingen_inspectie_id_inspecties_id_fk FOREIGN KEY (inspectie_id) REFERENCES public.inspecties(id) ON DELETE CASCADE;


--
-- Name: inspectie_bevindingen inspectie_bevindingen_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspectie_bevindingen
    ADD CONSTRAINT inspectie_bevindingen_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE SET NULL;


--
-- Name: inspecties inspecties_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspecties
    ADD CONSTRAINT inspecties_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: inspecties inspecties_inspecteur_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspecties
    ADD CONSTRAINT inspecties_inspecteur_id_gebruikers_id_fk FOREIGN KEY (inspecteur_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: inspecties inspecties_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inspecties
    ADD CONSTRAINT inspecties_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE SET NULL;


--
-- Name: jaarafsluiting_regels jaarafsluiting_regels_uitgevoerd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jaarafsluiting_regels
    ADD CONSTRAINT jaarafsluiting_regels_uitgevoerd_door_id_gebruikers_id_fk FOREIGN KEY (uitgevoerd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: jaarafsluiting_regels jaarafsluiting_regels_verlofsoort_id_verlofsoorten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jaarafsluiting_regels
    ADD CONSTRAINT jaarafsluiting_regels_verlofsoort_id_verlofsoorten_id_fk FOREIGN KEY (verlofsoort_id) REFERENCES public.verlofsoorten(id) ON DELETE SET NULL;


--
-- Name: jaarafsluiting_regels jaarafsluiting_regels_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jaarafsluiting_regels
    ADD CONSTRAINT jaarafsluiting_regels_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: label_applicaties label_applicaties_label_id_labels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label_applicaties
    ADD CONSTRAINT label_applicaties_label_id_labels_id_fk FOREIGN KEY (label_id) REFERENCES public.labels(id) ON DELETE CASCADE;


--
-- Name: label_applicaties label_applicaties_type_code_voorziening_types_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.label_applicaties
    ADD CONSTRAINT label_applicaties_type_code_voorziening_types_code_fk FOREIGN KEY (type_code) REFERENCES public.voorziening_types(code) ON DELETE CASCADE;


--
-- Name: labels labels_fabrikant_id_fabrikanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_fabrikant_id_fabrikanten_id_fk FOREIGN KEY (fabrikant_id) REFERENCES public.fabrikanten(id) ON DELETE SET NULL;


--
-- Name: labels labels_testrapport_id_testrapporten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_testrapport_id_testrapporten_id_fk FOREIGN KEY (testrapport_id) REFERENCES public.testrapporten(id) ON DELETE SET NULL;


--
-- Name: labels labels_type_code_voorziening_types_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_type_code_voorziening_types_code_fk FOREIGN KEY (type_code) REFERENCES public.voorziening_types(code) ON DELETE SET NULL;


--
-- Name: leverancier_prestaties leverancier_prestaties_geregistreerd_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leverancier_prestaties
    ADD CONSTRAINT leverancier_prestaties_geregistreerd_door_gebruikers_id_fk FOREIGN KEY (geregistreerd_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: leverancier_prestaties leverancier_prestaties_leverancier_id_leveranciers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leverancier_prestaties
    ADD CONSTRAINT leverancier_prestaties_leverancier_id_leveranciers_id_fk FOREIGN KEY (leverancier_id) REFERENCES public.leveranciers(id) ON DELETE CASCADE;


--
-- Name: login_pogingen login_pogingen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_pogingen
    ADD CONSTRAINT login_pogingen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: loon_output_bestanden loon_output_bestanden_gepubliceerd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loon_output_bestanden
    ADD CONSTRAINT loon_output_bestanden_gepubliceerd_door_id_gebruikers_id_fk FOREIGN KEY (gepubliceerd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: loon_output_bestanden loon_output_bestanden_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loon_output_bestanden
    ADD CONSTRAINT loon_output_bestanden_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: loon_output_bestanden loon_output_bestanden_uploader_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loon_output_bestanden
    ADD CONSTRAINT loon_output_bestanden_uploader_id_gebruikers_id_fk FOREIGN KEY (uploader_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: loon_output_bestanden loon_output_bestanden_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loon_output_bestanden
    ADD CONSTRAINT loon_output_bestanden_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: magazijn_inkooporder_regels magazijn_inkooporder_regels_artikel_id_artikelen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_inkooporder_regels
    ADD CONSTRAINT magazijn_inkooporder_regels_artikel_id_artikelen_id_fk FOREIGN KEY (artikel_id) REFERENCES public.artikelen(id) ON DELETE CASCADE;


--
-- Name: magazijn_inkooporder_regels magazijn_inkooporder_regels_inkooporder_id_magazijn_inkooporder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_inkooporder_regels
    ADD CONSTRAINT magazijn_inkooporder_regels_inkooporder_id_magazijn_inkooporder FOREIGN KEY (inkooporder_id) REFERENCES public.magazijn_inkooporders(id) ON DELETE CASCADE;


--
-- Name: magazijn_inkooporders magazijn_inkooporders_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_inkooporders
    ADD CONSTRAINT magazijn_inkooporders_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: magazijn_inkooporders magazijn_inkooporders_leverancier_id_leveranciers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_inkooporders
    ADD CONSTRAINT magazijn_inkooporders_leverancier_id_leveranciers_id_fk FOREIGN KEY (leverancier_id) REFERENCES public.leveranciers(id) ON DELETE SET NULL;


--
-- Name: magazijn_instellingen magazijn_instellingen_bijgewerkt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_instellingen
    ADD CONSTRAINT magazijn_instellingen_bijgewerkt_door_id_gebruikers_id_fk FOREIGN KEY (bijgewerkt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: magazijn_picklijst_regels magazijn_picklijst_regels_artikel_id_artikelen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijst_regels
    ADD CONSTRAINT magazijn_picklijst_regels_artikel_id_artikelen_id_fk FOREIGN KEY (artikel_id) REFERENCES public.artikelen(id) ON DELETE CASCADE;


--
-- Name: magazijn_picklijst_regels magazijn_picklijst_regels_locatie_id_magazijn_locaties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijst_regels
    ADD CONSTRAINT magazijn_picklijst_regels_locatie_id_magazijn_locaties_id_fk FOREIGN KEY (locatie_id) REFERENCES public.magazijn_locaties(id) ON DELETE SET NULL;


--
-- Name: magazijn_picklijst_regels magazijn_picklijst_regels_picklijst_id_magazijn_picklijsten_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijst_regels
    ADD CONSTRAINT magazijn_picklijst_regels_picklijst_id_magazijn_picklijsten_id_ FOREIGN KEY (picklijst_id) REFERENCES public.magazijn_picklijsten(id) ON DELETE CASCADE;


--
-- Name: magazijn_picklijsten magazijn_picklijsten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijsten
    ADD CONSTRAINT magazijn_picklijsten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: magazijn_picklijsten magazijn_picklijsten_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijsten
    ADD CONSTRAINT magazijn_picklijsten_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: magazijn_picklijsten magazijn_picklijsten_verwerkt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_picklijsten
    ADD CONSTRAINT magazijn_picklijsten_verwerkt_door_id_gebruikers_id_fk FOREIGN KEY (verwerkt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: magazijn_snoozes magazijn_snoozes_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_snoozes
    ADD CONSTRAINT magazijn_snoozes_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: magazijn_snoozes magazijn_snoozes_artikel_id_artikelen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_snoozes
    ADD CONSTRAINT magazijn_snoozes_artikel_id_artikelen_id_fk FOREIGN KEY (artikel_id) REFERENCES public.artikelen(id) ON DELETE CASCADE;


--
-- Name: magazijn_stellingscans magazijn_stellingscans_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_stellingscans
    ADD CONSTRAINT magazijn_stellingscans_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: magazijn_stellingscans magazijn_stellingscans_goedgekeurd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_stellingscans
    ADD CONSTRAINT magazijn_stellingscans_goedgekeurd_door_id_gebruikers_id_fk FOREIGN KEY (goedgekeurd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: magazijn_stellingscans magazijn_stellingscans_locatie_id_magazijn_locaties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_stellingscans
    ADD CONSTRAINT magazijn_stellingscans_locatie_id_magazijn_locaties_id_fk FOREIGN KEY (locatie_id) REFERENCES public.magazijn_locaties(id) ON DELETE SET NULL;


--
-- Name: magazijn_stellingscans magazijn_stellingscans_retour_project_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magazijn_stellingscans
    ADD CONSTRAINT magazijn_stellingscans_retour_project_id_opdrachten_id_fk FOREIGN KEY (retour_project_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: materiaal_aanvragen materiaal_aanvragen_behandeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiaal_aanvragen
    ADD CONSTRAINT materiaal_aanvragen_behandeld_door_id_gebruikers_id_fk FOREIGN KEY (behandeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: materiaal_aanvragen materiaal_aanvragen_ingediend_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiaal_aanvragen
    ADD CONSTRAINT materiaal_aanvragen_ingediend_door_id_gebruikers_id_fk FOREIGN KEY (ingediend_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: materiaal_aanvragen materiaal_aanvragen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiaal_aanvragen
    ADD CONSTRAINT materiaal_aanvragen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: medewerker_aanstellingen medewerker_aanstellingen_functie_id_functies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_aanstellingen
    ADD CONSTRAINT medewerker_aanstellingen_functie_id_functies_id_fk FOREIGN KEY (functie_id) REFERENCES public.functies(id) ON DELETE SET NULL;


--
-- Name: medewerker_aanstellingen medewerker_aanstellingen_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_aanstellingen
    ADD CONSTRAINT medewerker_aanstellingen_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: medewerker_aanstellingen medewerker_aanstellingen_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_aanstellingen
    ADD CONSTRAINT medewerker_aanstellingen_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: medewerker_cao_keuzes medewerker_cao_keuzes_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_cao_keuzes
    ADD CONSTRAINT medewerker_cao_keuzes_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: medewerker_documenten medewerker_documenten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_documenten
    ADD CONSTRAINT medewerker_documenten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: medewerker_documenten medewerker_documenten_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_documenten
    ADD CONSTRAINT medewerker_documenten_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: medewerker_opleidingen medewerker_opleidingen_certificaat_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_opleidingen
    ADD CONSTRAINT medewerker_opleidingen_certificaat_document_id_documenten_id_fk FOREIGN KEY (certificaat_document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: medewerker_opleidingen medewerker_opleidingen_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_opleidingen
    ADD CONSTRAINT medewerker_opleidingen_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: medewerker_opleidingen medewerker_opleidingen_opleiding_id_opleidingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerker_opleidingen
    ADD CONSTRAINT medewerker_opleidingen_opleiding_id_opleidingen_id_fk FOREIGN KEY (opleiding_id) REFERENCES public.opleidingen(id) ON DELETE CASCADE;


--
-- Name: medewerkers medewerkers_functie_id_functies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerkers
    ADD CONSTRAINT medewerkers_functie_id_functies_id_fk FOREIGN KEY (functie_id) REFERENCES public.functies(id) ON DELETE SET NULL;


--
-- Name: medewerkers medewerkers_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerkers
    ADD CONSTRAINT medewerkers_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: medewerkers medewerkers_leidinggevende_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerkers
    ADD CONSTRAINT medewerkers_leidinggevende_id_medewerkers_id_fk FOREIGN KEY (leidinggevende_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: medewerkers medewerkers_uitzendbureau_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerkers
    ADD CONSTRAINT medewerkers_uitzendbureau_id_crm_klanten_id_fk FOREIGN KEY (uitzendbureau_id) REFERENCES public.crm_klanten(id) ON DELETE SET NULL;


--
-- Name: medewerkers medewerkers_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medewerkers
    ADD CONSTRAINT medewerkers_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: mod_calc_adviezen mod_calc_adviezen_calculatie_id_mod_calc_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_adviezen
    ADD CONSTRAINT mod_calc_adviezen_calculatie_id_mod_calc_headers_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.mod_calc_headers(id) ON DELETE CASCADE;


--
-- Name: mod_calc_artikelen mod_calc_artikelen_leverancier_id_mod_calc_leveranciers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_artikelen
    ADD CONSTRAINT mod_calc_artikelen_leverancier_id_mod_calc_leveranciers_id_fk FOREIGN KEY (leverancier_id) REFERENCES public.mod_calc_leveranciers(id) ON DELETE SET NULL;


--
-- Name: mod_calc_bronbestanden mod_calc_bronbestanden_calculatie_id_mod_calc_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_bronbestanden
    ADD CONSTRAINT mod_calc_bronbestanden_calculatie_id_mod_calc_headers_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.mod_calc_headers(id) ON DELETE SET NULL;


--
-- Name: mod_calc_bronbestanden mod_calc_bronbestanden_uploader_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_bronbestanden
    ADD CONSTRAINT mod_calc_bronbestanden_uploader_id_gebruikers_id_fk FOREIGN KEY (uploader_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: mod_calc_eenheden mod_calc_eenheden_calculatie_id_mod_calc_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_eenheden
    ADD CONSTRAINT mod_calc_eenheden_calculatie_id_mod_calc_headers_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.mod_calc_headers(id) ON DELETE CASCADE;


--
-- Name: mod_calc_headers mod_calc_headers_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_headers
    ADD CONSTRAINT mod_calc_headers_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: mod_calc_headers mod_calc_headers_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_headers
    ADD CONSTRAINT mod_calc_headers_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: mod_calc_headers mod_calc_headers_opname_id_opnames_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_headers
    ADD CONSTRAINT mod_calc_headers_opname_id_opnames_id_fk FOREIGN KEY (opname_id) REFERENCES public.opnames(id) ON DELETE SET NULL;


--
-- Name: mod_calc_inkoop_items mod_calc_inkoop_items_calculatie_id_mod_calc_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_inkoop_items
    ADD CONSTRAINT mod_calc_inkoop_items_calculatie_id_mod_calc_headers_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.mod_calc_headers(id) ON DELETE CASCADE;


--
-- Name: mod_calc_inkoop_items mod_calc_inkoop_items_leverancier_id_mod_calc_leveranciers_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_inkoop_items
    ADD CONSTRAINT mod_calc_inkoop_items_leverancier_id_mod_calc_leveranciers_id_f FOREIGN KEY (leverancier_id) REFERENCES public.mod_calc_leveranciers(id) ON DELETE SET NULL;


--
-- Name: mod_calc_inkoop_items mod_calc_inkoop_items_regel_id_mod_calc_regels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_inkoop_items
    ADD CONSTRAINT mod_calc_inkoop_items_regel_id_mod_calc_regels_id_fk FOREIGN KEY (regel_id) REFERENCES public.mod_calc_regels(id) ON DELETE SET NULL;


--
-- Name: mod_calc_regels mod_calc_regels_artikel_id_mod_calc_artikelen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_regels
    ADD CONSTRAINT mod_calc_regels_artikel_id_mod_calc_artikelen_id_fk FOREIGN KEY (artikel_id) REFERENCES public.mod_calc_artikelen(id) ON DELETE SET NULL;


--
-- Name: mod_calc_regels mod_calc_regels_calculatie_id_mod_calc_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_regels
    ADD CONSTRAINT mod_calc_regels_calculatie_id_mod_calc_headers_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.mod_calc_headers(id) ON DELETE CASCADE;


--
-- Name: mod_calc_regels mod_calc_regels_eenheid_id_mod_calc_eenheden_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_regels
    ADD CONSTRAINT mod_calc_regels_eenheid_id_mod_calc_eenheden_id_fk FOREIGN KEY (eenheid_id) REFERENCES public.mod_calc_eenheden(id) ON DELETE SET NULL;


--
-- Name: mod_calc_regels mod_calc_regels_normtijd_id_mod_calc_normtijden_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_regels
    ADD CONSTRAINT mod_calc_regels_normtijd_id_mod_calc_normtijden_id_fk FOREIGN KEY (normtijd_id) REFERENCES public.mod_calc_normtijden(id) ON DELETE SET NULL;


--
-- Name: mod_calc_versies mod_calc_versies_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_versies
    ADD CONSTRAINT mod_calc_versies_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: mod_calc_versies mod_calc_versies_calculatie_id_mod_calc_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_calc_versies
    ADD CONSTRAINT mod_calc_versies_calculatie_id_mod_calc_headers_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.mod_calc_headers(id) ON DELETE CASCADE;


--
-- Name: module_beoordelingen module_beoordelingen_beoordeeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_beoordelingen
    ADD CONSTRAINT module_beoordelingen_beoordeeld_door_id_gebruikers_id_fk FOREIGN KEY (beoordeeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: monteur_achievements monteur_achievements_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monteur_achievements
    ADD CONSTRAINT monteur_achievements_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: monteur_achievements monteur_achievements_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monteur_achievements
    ADD CONSTRAINT monteur_achievements_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: muis_gebeurtenissen muis_gebeurtenissen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.muis_gebeurtenissen
    ADD CONSTRAINT muis_gebeurtenissen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: object_rechten object_rechten_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_rechten
    ADD CONSTRAINT object_rechten_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: object_rechten object_rechten_verleend_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_rechten
    ADD CONSTRAINT object_rechten_verleend_door_gebruikers_id_fk FOREIGN KEY (verleend_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: offerte_bijlagen offerte_bijlagen_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_bijlagen
    ADD CONSTRAINT offerte_bijlagen_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_contract_adviezen offerte_contract_adviezen_bevestigd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_contract_adviezen
    ADD CONSTRAINT offerte_contract_adviezen_bevestigd_door_id_gebruikers_id_fk FOREIGN KEY (bevestigd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: offerte_contract_adviezen offerte_contract_adviezen_contract_id_offerte_klant_contracten_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_contract_adviezen
    ADD CONSTRAINT offerte_contract_adviezen_contract_id_offerte_klant_contracten_ FOREIGN KEY (contract_id) REFERENCES public.offerte_klant_contracten(id) ON DELETE CASCADE;


--
-- Name: offerte_email_log offerte_email_log_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_email_log
    ADD CONSTRAINT offerte_email_log_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_handtekeningen offerte_handtekeningen_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_handtekeningen
    ADD CONSTRAINT offerte_handtekeningen_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE RESTRICT;


--
-- Name: offerte_hoofdstukken offerte_hoofdstukken_sjabloon_id_offerte_sjablonen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_hoofdstukken
    ADD CONSTRAINT offerte_hoofdstukken_sjabloon_id_offerte_sjablonen_id_fk FOREIGN KEY (sjabloon_id) REFERENCES public.offerte_sjablonen(id) ON DELETE CASCADE;


--
-- Name: offerte_klant_contracten offerte_klant_contracten_geupload_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_klant_contracten
    ADD CONSTRAINT offerte_klant_contracten_geupload_door_id_gebruikers_id_fk FOREIGN KEY (geupload_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: offerte_klant_contracten offerte_klant_contracten_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_klant_contracten
    ADD CONSTRAINT offerte_klant_contracten_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_portaal_tokens offerte_portaal_tokens_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_portaal_tokens
    ADD CONSTRAINT offerte_portaal_tokens_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_regels offerte_regels_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_regels
    ADD CONSTRAINT offerte_regels_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_regels offerte_regels_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_regels
    ADD CONSTRAINT offerte_regels_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE SET NULL;


--
-- Name: offerte_secties offerte_secties_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_secties
    ADD CONSTRAINT offerte_secties_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_tracking offerte_tracking_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_tracking
    ADD CONSTRAINT offerte_tracking_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_uitgangspunten offerte_uitgangspunten_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_uitgangspunten
    ADD CONSTRAINT offerte_uitgangspunten_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_uitgangspunten offerte_uitgangspunten_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_uitgangspunten
    ADD CONSTRAINT offerte_uitgangspunten_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE SET NULL;


--
-- Name: offerte_versies offerte_versies_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_versies
    ADD CONSTRAINT offerte_versies_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: offerte_versies offerte_versies_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_versies
    ADD CONSTRAINT offerte_versies_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offerte_vragen offerte_vragen_offerte_id_offertes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offerte_vragen
    ADD CONSTRAINT offerte_vragen_offerte_id_offertes_id_fk FOREIGN KEY (offerte_id) REFERENCES public.offertes(id) ON DELETE CASCADE;


--
-- Name: offertes offertes_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: offertes offertes_auto_project_id_projecten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_auto_project_id_projecten_id_fk FOREIGN KEY (auto_project_id) REFERENCES public.projecten(id) ON DELETE SET NULL;


--
-- Name: offertes offertes_behandeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_behandeld_door_id_gebruikers_id_fk FOREIGN KEY (behandeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: offertes offertes_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: offertes offertes_klant_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_klant_id_crm_klanten_id_fk FOREIGN KEY (klant_id) REFERENCES public.crm_klanten(id) ON DELETE SET NULL;


--
-- Name: offertes offertes_sjabloon_id_offerte_sjablonen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_sjabloon_id_offerte_sjablonen_id_fk FOREIGN KEY (sjabloon_id) REFERENCES public.offerte_sjablonen(id) ON DELETE SET NULL;


--
-- Name: offertes offertes_studio_model_id_document_studio_modellen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_studio_model_id_document_studio_modellen_id_fk FOREIGN KEY (studio_model_id) REFERENCES public.document_studio_modellen(id) ON DELETE SET NULL;


--
-- Name: offertes offertes_voorwaarden_set_id_offerte_voorwaarden_sets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offertes
    ADD CONSTRAINT offertes_voorwaarden_set_id_offerte_voorwaarden_sets_id_fk FOREIGN KEY (voorwaarden_set_id) REFERENCES public.offerte_voorwaarden_sets(id) ON DELETE SET NULL;


--
-- Name: onderaannemer_orders onderaannemer_orders_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderaannemer_orders
    ADD CONSTRAINT onderaannemer_orders_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: onderhanden_werk_overrides onderhanden_werk_overrides_bijgewerkt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhanden_werk_overrides
    ADD CONSTRAINT onderhanden_werk_overrides_bijgewerkt_door_id_gebruikers_id_fk FOREIGN KEY (bijgewerkt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: onderhanden_werk_overrides onderhanden_werk_overrides_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhanden_werk_overrides
    ADD CONSTRAINT onderhanden_werk_overrides_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: onderhoud onderhoud_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoud
    ADD CONSTRAINT onderhoud_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: onderhoud onderhoud_toegewezen_aan_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoud
    ADD CONSTRAINT onderhoud_toegewezen_aan_id_gebruikers_id_fk FOREIGN KEY (toegewezen_aan_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: onderhoud onderhoud_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoud
    ADD CONSTRAINT onderhoud_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE SET NULL;


--
-- Name: onderhoudscontracten onderhoudscontracten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoudscontracten
    ADD CONSTRAINT onderhoudscontracten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: onderhoudscontracten onderhoudscontracten_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onderhoudscontracten
    ADD CONSTRAINT onderhoudscontracten_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: opdrachten opdrachten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachten
    ADD CONSTRAINT opdrachten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: opdrachten opdrachten_calculatie_id_mod_calc_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachten
    ADD CONSTRAINT opdrachten_calculatie_id_mod_calc_headers_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.mod_calc_headers(id) ON DELETE SET NULL;


--
-- Name: opdrachten opdrachten_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachten
    ADD CONSTRAINT opdrachten_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: opdrachten opdrachten_project_id_projecten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachten
    ADD CONSTRAINT opdrachten_project_id_projecten_id_fk FOREIGN KEY (project_id) REFERENCES public.projecten(id) ON DELETE SET NULL;


--
-- Name: opdrachtgever_voorkeuren opdrachtgever_voorkeuren_klant_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opdrachtgever_voorkeuren
    ADD CONSTRAINT opdrachtgever_voorkeuren_klant_id_crm_klanten_id_fk FOREIGN KEY (klant_id) REFERENCES public.crm_klanten(id) ON DELETE CASCADE;


--
-- Name: opleverrapporten opleverrapporten_aangemaakt_door_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opleverrapporten
    ADD CONSTRAINT opleverrapporten_aangemaakt_door_gebruikers_id_fk FOREIGN KEY (aangemaakt_door) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: opleverrapporten opleverrapporten_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opleverrapporten
    ADD CONSTRAINT opleverrapporten_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: opleverrapporten opleverrapporten_werkbon_id_werkbonnen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opleverrapporten
    ADD CONSTRAINT opleverrapporten_werkbon_id_werkbonnen_id_fk FOREIGN KEY (werkbon_id) REFERENCES public.werkbonnen(id) ON DELETE SET NULL;


--
-- Name: opname_fotos opname_fotos_item_id_opname_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_fotos
    ADD CONSTRAINT opname_fotos_item_id_opname_items_id_fk FOREIGN KEY (item_id) REFERENCES public.opname_items(id) ON DELETE CASCADE;


--
-- Name: opname_items opname_items_opname_id_opnames_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_items
    ADD CONSTRAINT opname_items_opname_id_opnames_id_fk FOREIGN KEY (opname_id) REFERENCES public.opnames(id) ON DELETE CASCADE;


--
-- Name: opname_items opname_items_verdieping_id_verdiepingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opname_items
    ADD CONSTRAINT opname_items_verdieping_id_verdiepingen_id_fk FOREIGN KEY (verdieping_id) REFERENCES public.verdiepingen(id) ON DELETE SET NULL;


--
-- Name: opnames opnames_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opnames
    ADD CONSTRAINT opnames_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: opnames opnames_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opnames
    ADD CONSTRAINT opnames_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: pbm_inspecties pbm_inspecties_beoordeeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_inspecties
    ADD CONSTRAINT pbm_inspecties_beoordeeld_door_id_gebruikers_id_fk FOREIGN KEY (beoordeeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: pbm_inspecties pbm_inspecties_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_inspecties
    ADD CONSTRAINT pbm_inspecties_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: pbm_inspecties pbm_inspecties_pbm_item_id_pbm_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_inspecties
    ADD CONSTRAINT pbm_inspecties_pbm_item_id_pbm_items_id_fk FOREIGN KEY (pbm_item_id) REFERENCES public.pbm_items(id) ON DELETE CASCADE;


--
-- Name: pbm_items pbm_items_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_items
    ADD CONSTRAINT pbm_items_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: pbm_items pbm_items_uitgeleend_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pbm_items
    ADD CONSTRAINT pbm_items_uitgeleend_door_id_gebruikers_id_fk FOREIGN KEY (uitgeleend_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: pim_foto_analyses pim_foto_analyses_stap_id_pim_uitvoering_stappen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_foto_analyses
    ADD CONSTRAINT pim_foto_analyses_stap_id_pim_uitvoering_stappen_id_fk FOREIGN KEY (stap_id) REFERENCES public.pim_uitvoering_stappen(id) ON DELETE CASCADE;


--
-- Name: pim_modellen pim_modellen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_modellen
    ADD CONSTRAINT pim_modellen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: pim_uitvoering_stappen pim_uitvoering_stappen_pim_id_pim_modellen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_uitvoering_stappen
    ADD CONSTRAINT pim_uitvoering_stappen_pim_id_pim_modellen_id_fk FOREIGN KEY (pim_id) REFERENCES public.pim_modellen(id) ON DELETE CASCADE;


--
-- Name: pim_uitvoering_stappen pim_uitvoering_stappen_voltooid_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pim_uitvoering_stappen
    ADD CONSTRAINT pim_uitvoering_stappen_voltooid_door_id_gebruikers_id_fk FOREIGN KEY (voltooid_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: planning_afwezigheid planning_afwezigheid_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_afwezigheid
    ADD CONSTRAINT planning_afwezigheid_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: planning_afwezigheid planning_afwezigheid_goedgekeurd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_afwezigheid
    ADD CONSTRAINT planning_afwezigheid_goedgekeurd_door_id_gebruikers_id_fk FOREIGN KEY (goedgekeurd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: planning_afwezigheid planning_afwezigheid_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_afwezigheid
    ADD CONSTRAINT planning_afwezigheid_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: planning_items planning_items_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: planning_items planning_items_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: planning_items planning_items_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: planning_items planning_items_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: planning_items planning_items_project_id_projecten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_items
    ADD CONSTRAINT planning_items_project_id_projecten_id_fk FOREIGN KEY (project_id) REFERENCES public.projecten(id) ON DELETE SET NULL;


--
-- Name: planning_meerwerk planning_meerwerk_planning_item_id_planning_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planning_meerwerk
    ADD CONSTRAINT planning_meerwerk_planning_item_id_planning_items_id_fk FOREIGN KEY (planning_item_id) REFERENCES public.planning_items(id) ON DELETE CASCADE;


--
-- Name: poortwachter_dossiers poortwachter_dossiers_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_dossiers
    ADD CONSTRAINT poortwachter_dossiers_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: poortwachter_dossiers poortwachter_dossiers_ziekmelding_id_ziekmeldingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_dossiers
    ADD CONSTRAINT poortwachter_dossiers_ziekmelding_id_ziekmeldingen_id_fk FOREIGN KEY (ziekmelding_id) REFERENCES public.ziekmeldingen(id) ON DELETE CASCADE;


--
-- Name: poortwachter_mijlpalen poortwachter_mijlpalen_bijgewerkt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_mijlpalen
    ADD CONSTRAINT poortwachter_mijlpalen_bijgewerkt_door_id_gebruikers_id_fk FOREIGN KEY (bijgewerkt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: poortwachter_mijlpalen poortwachter_mijlpalen_dossier_id_poortwachter_dossiers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poortwachter_mijlpalen
    ADD CONSTRAINT poortwachter_mijlpalen_dossier_id_poortwachter_dossiers_id_fk FOREIGN KEY (dossier_id) REFERENCES public.poortwachter_dossiers(id) ON DELETE CASCADE;


--
-- Name: project_begrotingen project_begrotingen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_begrotingen
    ADD CONSTRAINT project_begrotingen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: project_begrotingen project_begrotingen_calculatie_id_mod_calc_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_begrotingen
    ADD CONSTRAINT project_begrotingen_calculatie_id_mod_calc_headers_id_fk FOREIGN KEY (calculatie_id) REFERENCES public.mod_calc_headers(id) ON DELETE SET NULL;


--
-- Name: project_begrotingen project_begrotingen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_begrotingen
    ADD CONSTRAINT project_begrotingen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: project_begrotingen project_begrotingen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_begrotingen
    ADD CONSTRAINT project_begrotingen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: project_begrotingen project_begrotingen_project_id_projecten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_begrotingen
    ADD CONSTRAINT project_begrotingen_project_id_projecten_id_fk FOREIGN KEY (project_id) REFERENCES public.projecten(id) ON DELETE SET NULL;


--
-- Name: project_begrotingen project_begrotingen_vastgesteld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_begrotingen
    ADD CONSTRAINT project_begrotingen_vastgesteld_door_id_gebruikers_id_fk FOREIGN KEY (vastgesteld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: projecten projecten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projecten
    ADD CONSTRAINT projecten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: projecten projecten_crm_klant_id_crm_klanten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projecten
    ADD CONSTRAINT projecten_crm_klant_id_crm_klanten_id_fk FOREIGN KEY (crm_klant_id) REFERENCES public.crm_klanten(id) ON DELETE SET NULL;


--
-- Name: projecten projecten_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projecten
    ADD CONSTRAINT projecten_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: push_tokens push_tokens_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: regie_begroting regie_begroting_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_begroting
    ADD CONSTRAINT regie_begroting_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: regie_begroting regie_begroting_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_begroting
    ADD CONSTRAINT regie_begroting_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: regie_materialen regie_materialen_geboekt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_materialen
    ADD CONSTRAINT regie_materialen_geboekt_door_id_gebruikers_id_fk FOREIGN KEY (geboekt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: regie_materialen regie_materialen_geboekt_door_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_materialen
    ADD CONSTRAINT regie_materialen_geboekt_door_medewerker_id_medewerkers_id_fk FOREIGN KEY (geboekt_door_medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: regie_materialen regie_materialen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_materialen
    ADD CONSTRAINT regie_materialen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: regie_tarieven regie_tarieven_voorwaarden_id_regie_voorwaarden_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_tarieven
    ADD CONSTRAINT regie_tarieven_voorwaarden_id_regie_voorwaarden_id_fk FOREIGN KEY (voorwaarden_id) REFERENCES public.regie_voorwaarden(id) ON DELETE CASCADE;


--
-- Name: regie_voorwaarden regie_voorwaarden_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_voorwaarden
    ADD CONSTRAINT regie_voorwaarden_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: regie_voorwaarden regie_voorwaarden_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regie_voorwaarden
    ADD CONSTRAINT regie_voorwaarden_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: release_update_notes release_update_notes_release_id_kantoor_releases_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.release_update_notes
    ADD CONSTRAINT release_update_notes_release_id_kantoor_releases_id_fk FOREIGN KEY (release_id) REFERENCES public.kantoor_releases(id) ON DELETE CASCADE;


--
-- Name: reserveringen reserveringen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserveringen
    ADD CONSTRAINT reserveringen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: reserveringen reserveringen_artikel_id_artikelen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserveringen
    ADD CONSTRAINT reserveringen_artikel_id_artikelen_id_fk FOREIGN KEY (artikel_id) REFERENCES public.artikelen(id) ON DELETE CASCADE;


--
-- Name: reserveringen reserveringen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserveringen
    ADD CONSTRAINT reserveringen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: salaris_mutaties salaris_mutaties_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaris_mutaties
    ADD CONSTRAINT salaris_mutaties_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: salaris_mutaties salaris_mutaties_gecontroleerd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaris_mutaties
    ADD CONSTRAINT salaris_mutaties_gecontroleerd_door_id_gebruikers_id_fk FOREIGN KEY (gecontroleerd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: salaris_mutaties salaris_mutaties_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaris_mutaties
    ADD CONSTRAINT salaris_mutaties_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: salaris_mutaties salaris_mutaties_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salaris_mutaties
    ADD CONSTRAINT salaris_mutaties_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: salarisbatches salarisbatches_uploader_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbatches
    ADD CONSTRAINT salarisbatches_uploader_id_gebruikers_id_fk FOREIGN KEY (uploader_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: salarisbatches salarisbatches_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbatches
    ADD CONSTRAINT salarisbatches_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: salarisbestanden salarisbestanden_batch_id_salarisbatches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbestanden
    ADD CONSTRAINT salarisbestanden_batch_id_salarisbatches_id_fk FOREIGN KEY (batch_id) REFERENCES public.salarisbatches(id) ON DELETE SET NULL;


--
-- Name: salarisbestanden salarisbestanden_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbestanden
    ADD CONSTRAINT salarisbestanden_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: salarisbestanden salarisbestanden_uploader_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisbestanden
    ADD CONSTRAINT salarisbestanden_uploader_id_gebruikers_id_fk FOREIGN KEY (uploader_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: salarisdocument_audit salarisdocument_audit_document_id_salarisbestanden_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisdocument_audit
    ADD CONSTRAINT salarisdocument_audit_document_id_salarisbestanden_id_fk FOREIGN KEY (document_id) REFERENCES public.salarisbestanden(id) ON DELETE SET NULL;


--
-- Name: salarisdocument_audit salarisdocument_audit_sepa_id_sepa_bestanden_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salarisdocument_audit
    ADD CONSTRAINT salarisdocument_audit_sepa_id_sepa_bestanden_id_fk FOREIGN KEY (sepa_id) REFERENCES public.sepa_bestanden(id) ON DELETE SET NULL;


--
-- Name: scab_mail_bijlagen scab_mail_bijlagen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mail_bijlagen
    ADD CONSTRAINT scab_mail_bijlagen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: scab_mail_bijlagen scab_mail_bijlagen_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mail_bijlagen
    ADD CONSTRAINT scab_mail_bijlagen_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: scab_mail_bijlagen scab_mail_bijlagen_scab_mail_id_scab_mails_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mail_bijlagen
    ADD CONSTRAINT scab_mail_bijlagen_scab_mail_id_scab_mails_id_fk FOREIGN KEY (scab_mail_id) REFERENCES public.scab_mails(id) ON DELETE CASCADE;


--
-- Name: scab_mails scab_mails_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mails
    ADD CONSTRAINT scab_mails_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: scab_mails scab_mails_verzond_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mails
    ADD CONSTRAINT scab_mails_verzond_door_id_gebruikers_id_fk FOREIGN KEY (verzond_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: scab_mails scab_mails_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scab_mails
    ADD CONSTRAINT scab_mails_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: scheidingen scheidingen_verdieping_id_verdiepingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheidingen
    ADD CONSTRAINT scheidingen_verdieping_id_verdiepingen_id_fk FOREIGN KEY (verdieping_id) REFERENCES public.verdiepingen(id) ON DELETE CASCADE;


--
-- Name: sepa_bestanden sepa_bestanden_gedownload_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sepa_bestanden
    ADD CONSTRAINT sepa_bestanden_gedownload_door_id_gebruikers_id_fk FOREIGN KEY (gedownload_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: sepa_bestanden sepa_bestanden_uploader_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sepa_bestanden
    ADD CONSTRAINT sepa_bestanden_uploader_id_gebruikers_id_fk FOREIGN KEY (uploader_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: sepa_bestanden sepa_bestanden_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sepa_bestanden
    ADD CONSTRAINT sepa_bestanden_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: slim_upload_log slim_upload_log_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slim_upload_log
    ADD CONSTRAINT slim_upload_log_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: snagstream_rapporten snagstream_rapporten_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snagstream_rapporten
    ADD CONSTRAINT snagstream_rapporten_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: snagstream_rapporten snagstream_rapporten_uploader_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snagstream_rapporten
    ADD CONSTRAINT snagstream_rapporten_uploader_id_gebruikers_id_fk FOREIGN KEY (uploader_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: snagstream_snags snagstream_snags_overgenomen_als_voorziening_id_voorzieningen_i; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snagstream_snags
    ADD CONSTRAINT snagstream_snags_overgenomen_als_voorziening_id_voorzieningen_i FOREIGN KEY (overgenomen_als_voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE SET NULL;


--
-- Name: snagstream_snags snagstream_snags_rapport_id_snagstream_rapporten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.snagstream_snags
    ADD CONSTRAINT snagstream_snags_rapport_id_snagstream_rapporten_id_fk FOREIGN KEY (rapport_id) REFERENCES public.snagstream_rapporten(id) ON DELETE CASCADE;


--
-- Name: spot_ai_voorstellen spot_ai_voorstellen_beheerder_bevestigd_door_id_gebruikers_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_ai_voorstellen
    ADD CONSTRAINT spot_ai_voorstellen_beheerder_bevestigd_door_id_gebruikers_id_f FOREIGN KEY (beheerder_bevestigd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: spot_ai_voorstellen spot_ai_voorstellen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_ai_voorstellen
    ADD CONSTRAINT spot_ai_voorstellen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: spot_ai_voorstellen spot_ai_voorstellen_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_ai_voorstellen
    ADD CONSTRAINT spot_ai_voorstellen_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE SET NULL;


--
-- Name: spot_dossiers spot_dossiers_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spot_dossiers
    ADD CONSTRAINT spot_dossiers_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE CASCADE;


--
-- Name: tekeningen tekeningen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tekeningen
    ADD CONSTRAINT tekeningen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: tekeningen tekeningen_verdieping_id_verdiepingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tekeningen
    ADD CONSTRAINT tekeningen_verdieping_id_verdiepingen_id_fk FOREIGN KEY (verdieping_id) REFERENCES public.verdiepingen(id) ON DELETE SET NULL;


--
-- Name: toolbox_maand_opdrachten toolbox_maand_opdrachten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_maand_opdrachten
    ADD CONSTRAINT toolbox_maand_opdrachten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: toolbox_maand_opdrachten toolbox_maand_opdrachten_toolbox_id_veiligheid_toolboxen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_maand_opdrachten
    ADD CONSTRAINT toolbox_maand_opdrachten_toolbox_id_veiligheid_toolboxen_id_fk FOREIGN KEY (toolbox_id) REFERENCES public.veiligheid_toolboxen(id) ON DELETE CASCADE;


--
-- Name: toolbox_maand_status toolbox_maand_status_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_maand_status
    ADD CONSTRAINT toolbox_maand_status_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: toolbox_maand_status toolbox_maand_status_opdracht_id_toolbox_maand_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.toolbox_maand_status
    ADD CONSTRAINT toolbox_maand_status_opdracht_id_toolbox_maand_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.toolbox_maand_opdrachten(id) ON DELETE CASCADE;


--
-- Name: uitvoerder_berichten uitvoerder_berichten_sessie_id_uitvoerder_sessies_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoerder_berichten
    ADD CONSTRAINT uitvoerder_berichten_sessie_id_uitvoerder_sessies_id_fk FOREIGN KEY (sessie_id) REFERENCES public.uitvoerder_sessies(id) ON DELETE CASCADE;


--
-- Name: uitvoerder_sessies uitvoerder_sessies_monteur_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoerder_sessies
    ADD CONSTRAINT uitvoerder_sessies_monteur_id_gebruikers_id_fk FOREIGN KEY (monteur_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: uitvoerder_sessies uitvoerder_sessies_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoerder_sessies
    ADD CONSTRAINT uitvoerder_sessies_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: uitvoerder_sessies uitvoerder_sessies_werkdag_id_planning_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoerder_sessies
    ADD CONSTRAINT uitvoerder_sessies_werkdag_id_planning_items_id_fk FOREIGN KEY (werkdag_id) REFERENCES public.planning_items(id) ON DELETE SET NULL;


--
-- Name: uitvoeringsplan_taken uitvoeringsplan_taken_uitvoeringsplan_id_uitvoeringsplannen_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoeringsplan_taken
    ADD CONSTRAINT uitvoeringsplan_taken_uitvoeringsplan_id_uitvoeringsplannen_id_ FOREIGN KEY (uitvoeringsplan_id) REFERENCES public.uitvoeringsplannen(id) ON DELETE CASCADE;


--
-- Name: uitvoeringsplannen uitvoeringsplannen_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoeringsplannen
    ADD CONSTRAINT uitvoeringsplannen_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE CASCADE;


--
-- Name: uitvoeringsplannen uitvoeringsplannen_vastgesteld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uitvoeringsplannen
    ADD CONSTRAINT uitvoeringsplannen_vastgesteld_door_id_gebruikers_id_fk FOREIGN KEY (vastgesteld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: uren_registraties uren_registraties_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties
    ADD CONSTRAINT uren_registraties_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: uren_registraties uren_registraties_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties
    ADD CONSTRAINT uren_registraties_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: uren_registraties uren_registraties_goedgekeurd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties
    ADD CONSTRAINT uren_registraties_goedgekeurd_door_id_gebruikers_id_fk FOREIGN KEY (goedgekeurd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: uren_registraties uren_registraties_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties
    ADD CONSTRAINT uren_registraties_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: uren_registraties uren_registraties_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties
    ADD CONSTRAINT uren_registraties_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: uren_registraties uren_registraties_planning_item_id_planning_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties
    ADD CONSTRAINT uren_registraties_planning_item_id_planning_items_id_fk FOREIGN KEY (planning_item_id) REFERENCES public.planning_items(id) ON DELETE SET NULL;


--
-- Name: uren_registraties uren_registraties_project_id_projecten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uren_registraties
    ADD CONSTRAINT uren_registraties_project_id_projecten_id_fk FOREIGN KEY (project_id) REFERENCES public.projecten(id) ON DELETE SET NULL;


--
-- Name: veiligheid_incidenten veiligheid_incidenten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_incidenten
    ADD CONSTRAINT veiligheid_incidenten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: veiligheid_incidenten veiligheid_incidenten_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_incidenten
    ADD CONSTRAINT veiligheid_incidenten_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: veiligheid_incidenten veiligheid_incidenten_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_incidenten
    ADD CONSTRAINT veiligheid_incidenten_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: veiligheid_incidenten veiligheid_incidenten_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_incidenten
    ADD CONSTRAINT veiligheid_incidenten_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: veiligheid_lmras veiligheid_lmras_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_lmras
    ADD CONSTRAINT veiligheid_lmras_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: veiligheid_lmras veiligheid_lmras_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_lmras
    ADD CONSTRAINT veiligheid_lmras_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: veiligheid_lmras veiligheid_lmras_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_lmras
    ADD CONSTRAINT veiligheid_lmras_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE SET NULL;


--
-- Name: veiligheid_lmras veiligheid_lmras_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_lmras
    ADD CONSTRAINT veiligheid_lmras_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: veiligheid_meldingen_acties veiligheid_meldingen_acties_eigenaar_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen_acties
    ADD CONSTRAINT veiligheid_meldingen_acties_eigenaar_id_gebruikers_id_fk FOREIGN KEY (eigenaar_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: veiligheid_meldingen_acties veiligheid_meldingen_acties_melding_id_veiligheid_meldingen_id_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen_acties
    ADD CONSTRAINT veiligheid_meldingen_acties_melding_id_veiligheid_meldingen_id_ FOREIGN KEY (melding_id) REFERENCES public.veiligheid_meldingen(id) ON DELETE CASCADE;


--
-- Name: veiligheid_meldingen veiligheid_meldingen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen
    ADD CONSTRAINT veiligheid_meldingen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: veiligheid_meldingen veiligheid_meldingen_gemeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen
    ADD CONSTRAINT veiligheid_meldingen_gemeld_door_id_gebruikers_id_fk FOREIGN KEY (gemeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: veiligheid_meldingen veiligheid_meldingen_toegewezen_aan_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_meldingen
    ADD CONSTRAINT veiligheid_meldingen_toegewezen_aan_id_gebruikers_id_fk FOREIGN KEY (toegewezen_aan_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: veiligheid_toolbox_afrondingen veiligheid_toolbox_afrondingen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolbox_afrondingen
    ADD CONSTRAINT veiligheid_toolbox_afrondingen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: veiligheid_toolbox_afrondingen veiligheid_toolbox_afrondingen_toolbox_id_veiligheid_toolboxen_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolbox_afrondingen
    ADD CONSTRAINT veiligheid_toolbox_afrondingen_toolbox_id_veiligheid_toolboxen_ FOREIGN KEY (toolbox_id) REFERENCES public.veiligheid_toolboxen(id) ON DELETE CASCADE;


--
-- Name: veiligheid_toolbox_vragen veiligheid_toolbox_vragen_toolbox_id_veiligheid_toolboxen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolbox_vragen
    ADD CONSTRAINT veiligheid_toolbox_vragen_toolbox_id_veiligheid_toolboxen_id_fk FOREIGN KEY (toolbox_id) REFERENCES public.veiligheid_toolboxen(id) ON DELETE CASCADE;


--
-- Name: veiligheid_toolboxen veiligheid_toolboxen_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheid_toolboxen
    ADD CONSTRAINT veiligheid_toolboxen_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: veiligheidsmiddel_inspecties veiligheidsmiddel_inspecties_beoordeeld_door_id_gebruikers_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheidsmiddel_inspecties
    ADD CONSTRAINT veiligheidsmiddel_inspecties_beoordeeld_door_id_gebruikers_id_f FOREIGN KEY (beoordeeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: veiligheidsmiddel_inspecties veiligheidsmiddel_inspecties_middel_id_veiligheidsmiddelen_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheidsmiddel_inspecties
    ADD CONSTRAINT veiligheidsmiddel_inspecties_middel_id_veiligheidsmiddelen_id_f FOREIGN KEY (middel_id) REFERENCES public.veiligheidsmiddelen(id) ON DELETE CASCADE;


--
-- Name: veiligheidsmiddelen veiligheidsmiddelen_eigenaar_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veiligheidsmiddelen
    ADD CONSTRAINT veiligheidsmiddelen_eigenaar_id_gebruikers_id_fk FOREIGN KEY (eigenaar_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: verdiepingen verdiepingen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verdiepingen
    ADD CONSTRAINT verdiepingen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: verlof_aanvraag_log verlof_aanvraag_log_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_aanvraag_log
    ADD CONSTRAINT verlof_aanvraag_log_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: verlof_aanvraag_log verlof_aanvraag_log_uitgevoerd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_aanvraag_log
    ADD CONSTRAINT verlof_aanvraag_log_uitgevoerd_door_id_gebruikers_id_fk FOREIGN KEY (uitgevoerd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: verlof_aanvraag_log verlof_aanvraag_log_verlofaanvraag_id_verlofaanvragen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_aanvraag_log
    ADD CONSTRAINT verlof_aanvraag_log_verlofaanvraag_id_verlofaanvragen_id_fk FOREIGN KEY (verlofaanvraag_id) REFERENCES public.verlofaanvragen(id) ON DELETE CASCADE;


--
-- Name: verlof_correcties verlof_correcties_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_correcties
    ADD CONSTRAINT verlof_correcties_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: verlof_correcties verlof_correcties_uitgevoerd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_correcties
    ADD CONSTRAINT verlof_correcties_uitgevoerd_door_id_gebruikers_id_fk FOREIGN KEY (uitgevoerd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: verlof_correcties verlof_correcties_verlofsoort_id_verlofsoorten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_correcties
    ADD CONSTRAINT verlof_correcties_verlofsoort_id_verlofsoorten_id_fk FOREIGN KEY (verlofsoort_id) REFERENCES public.verlofsoorten(id) ON DELETE CASCADE;


--
-- Name: verlof_instellingen verlof_instellingen_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_instellingen
    ADD CONSTRAINT verlof_instellingen_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: verlof_saldi verlof_saldi_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_saldi
    ADD CONSTRAINT verlof_saldi_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: verlof_saldi verlof_saldi_verlofsoort_id_verlofsoorten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlof_saldi
    ADD CONSTRAINT verlof_saldi_verlofsoort_id_verlofsoorten_id_fk FOREIGN KEY (verlofsoort_id) REFERENCES public.verlofsoorten(id) ON DELETE CASCADE;


--
-- Name: verlofaanvragen verlofaanvragen_beoordeeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlofaanvragen
    ADD CONSTRAINT verlofaanvragen_beoordeeld_door_id_gebruikers_id_fk FOREIGN KEY (beoordeeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: verlofaanvragen verlofaanvragen_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlofaanvragen
    ADD CONSTRAINT verlofaanvragen_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: verlofaanvragen verlofaanvragen_verlofsoort_id_verlofsoorten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlofaanvragen
    ADD CONSTRAINT verlofaanvragen_verlofsoort_id_verlofsoorten_id_fk FOREIGN KEY (verlofsoort_id) REFERENCES public.verlofsoorten(id) ON DELETE CASCADE;


--
-- Name: verlofsoorten verlofsoorten_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verlofsoorten
    ADD CONSTRAINT verlofsoorten_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: vge_effectiviteitslog vge_effectiviteitslog_pim_stap_id_pim_uitvoering_stappen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vge_effectiviteitslog
    ADD CONSTRAINT vge_effectiviteitslog_pim_stap_id_pim_uitvoering_stappen_id_fk FOREIGN KEY (pim_stap_id) REFERENCES public.pim_uitvoering_stappen(id) ON DELETE CASCADE;


--
-- Name: vge_effectiviteitslog vge_effectiviteitslog_visual_id_fps_visuals_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vge_effectiviteitslog
    ADD CONSTRAINT vge_effectiviteitslog_visual_id_fps_visuals_id_fk FOREIGN KEY (visual_id) REFERENCES public.fps_visuals(id) ON DELETE CASCADE;


--
-- Name: voertuigen voertuigen_chauffeur_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voertuigen
    ADD CONSTRAINT voertuigen_chauffeur_id_gebruikers_id_fk FOREIGN KEY (chauffeur_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: voertuigen voertuigen_werkgever_id_werkgevers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voertuigen
    ADD CONSTRAINT voertuigen_werkgever_id_werkgevers_id_fk FOREIGN KEY (werkgever_id) REFERENCES public.werkgevers(id) ON DELETE SET NULL;


--
-- Name: voorraad voorraad_artikel_id_artikelen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad
    ADD CONSTRAINT voorraad_artikel_id_artikelen_id_fk FOREIGN KEY (artikel_id) REFERENCES public.artikelen(id) ON DELETE CASCADE;


--
-- Name: voorraad voorraad_locatie_id_magazijn_locaties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad
    ADD CONSTRAINT voorraad_locatie_id_magazijn_locaties_id_fk FOREIGN KEY (locatie_id) REFERENCES public.magazijn_locaties(id) ON DELETE SET NULL;


--
-- Name: voorraad_mutaties voorraad_mutaties_artikel_id_artikelen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad_mutaties
    ADD CONSTRAINT voorraad_mutaties_artikel_id_artikelen_id_fk FOREIGN KEY (artikel_id) REFERENCES public.artikelen(id) ON DELETE CASCADE;


--
-- Name: voorraad_mutaties voorraad_mutaties_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad_mutaties
    ADD CONSTRAINT voorraad_mutaties_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: voorraad_mutaties voorraad_mutaties_locatie_id_magazijn_locaties_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad_mutaties
    ADD CONSTRAINT voorraad_mutaties_locatie_id_magazijn_locaties_id_fk FOREIGN KEY (locatie_id) REFERENCES public.magazijn_locaties(id) ON DELETE SET NULL;


--
-- Name: voorraad_mutaties voorraad_mutaties_opdracht_id_opdrachten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorraad_mutaties
    ADD CONSTRAINT voorraad_mutaties_opdracht_id_opdrachten_id_fk FOREIGN KEY (opdracht_id) REFERENCES public.opdrachten(id) ON DELETE SET NULL;


--
-- Name: voorziening_labels voorziening_labels_label_id_labels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorziening_labels
    ADD CONSTRAINT voorziening_labels_label_id_labels_id_fk FOREIGN KEY (label_id) REFERENCES public.labels(id) ON DELETE CASCADE;


--
-- Name: voorziening_labels voorziening_labels_voorziening_id_voorzieningen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorziening_labels
    ADD CONSTRAINT voorziening_labels_voorziening_id_voorzieningen_id_fk FOREIGN KEY (voorziening_id) REFERENCES public.voorzieningen(id) ON DELETE CASCADE;


--
-- Name: voorzieningen voorzieningen_controleur_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorzieningen
    ADD CONSTRAINT voorzieningen_controleur_id_gebruikers_id_fk FOREIGN KEY (controleur_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: voorzieningen voorzieningen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorzieningen
    ADD CONSTRAINT voorzieningen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE CASCADE;


--
-- Name: voorzieningen voorzieningen_maker_monteur_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorzieningen
    ADD CONSTRAINT voorzieningen_maker_monteur_id_gebruikers_id_fk FOREIGN KEY (maker_monteur_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: voorzieningen voorzieningen_monteur_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorzieningen
    ADD CONSTRAINT voorzieningen_monteur_id_gebruikers_id_fk FOREIGN KEY (monteur_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: voorzieningen voorzieningen_verdieping_id_verdiepingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voorzieningen
    ADD CONSTRAINT voorzieningen_verdieping_id_verdiepingen_id_fk FOREIGN KEY (verdieping_id) REFERENCES public.verdiepingen(id) ON DELETE SET NULL;


--
-- Name: wachtwoord_reset_tokens wachtwoord_reset_tokens_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wachtwoord_reset_tokens
    ADD CONSTRAINT wachtwoord_reset_tokens_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: wagenpark_avg_logboek wagenpark_avg_logboek_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_avg_logboek
    ADD CONSTRAINT wagenpark_avg_logboek_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: wagenpark_avg_logboek wagenpark_avg_logboek_voertuig_id_voertuigen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_avg_logboek
    ADD CONSTRAINT wagenpark_avg_logboek_voertuig_id_voertuigen_id_fk FOREIGN KEY (voertuig_id) REFERENCES public.voertuigen(id) ON DELETE SET NULL;


--
-- Name: wagenpark_kosten wagenpark_kosten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kosten
    ADD CONSTRAINT wagenpark_kosten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: wagenpark_kosten wagenpark_kosten_project_id_projecten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kosten
    ADD CONSTRAINT wagenpark_kosten_project_id_projecten_id_fk FOREIGN KEY (project_id) REFERENCES public.projecten(id) ON DELETE SET NULL;


--
-- Name: wagenpark_kosten wagenpark_kosten_voertuig_id_voertuigen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kosten
    ADD CONSTRAINT wagenpark_kosten_voertuig_id_voertuigen_id_fk FOREIGN KEY (voertuig_id) REFERENCES public.voertuigen(id) ON DELETE CASCADE;


--
-- Name: wagenpark_kwartaalcontrole wagenpark_kwartaalcontrole_melding_id_wagenpark_meldingen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kwartaalcontrole
    ADD CONSTRAINT wagenpark_kwartaalcontrole_melding_id_wagenpark_meldingen_id_fk FOREIGN KEY (melding_id) REFERENCES public.wagenpark_meldingen(id) ON DELETE SET NULL;


--
-- Name: wagenpark_kwartaalcontrole wagenpark_kwartaalcontrole_voertuig_id_voertuigen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_kwartaalcontrole
    ADD CONSTRAINT wagenpark_kwartaalcontrole_voertuig_id_voertuigen_id_fk FOREIGN KEY (voertuig_id) REFERENCES public.voertuigen(id) ON DELETE CASCADE;


--
-- Name: wagenpark_meldingen wagenpark_meldingen_gemeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_meldingen
    ADD CONSTRAINT wagenpark_meldingen_gemeld_door_id_gebruikers_id_fk FOREIGN KEY (gemeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: wagenpark_meldingen wagenpark_meldingen_onderhoud_id_wagenpark_onderhoud_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_meldingen
    ADD CONSTRAINT wagenpark_meldingen_onderhoud_id_wagenpark_onderhoud_id_fk FOREIGN KEY (onderhoud_id) REFERENCES public.wagenpark_onderhoud(id) ON DELETE SET NULL;


--
-- Name: wagenpark_meldingen wagenpark_meldingen_toegewezen_beheerder_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_meldingen
    ADD CONSTRAINT wagenpark_meldingen_toegewezen_beheerder_id_gebruikers_id_fk FOREIGN KEY (toegewezen_beheerder_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: wagenpark_meldingen wagenpark_meldingen_voertuig_id_voertuigen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_meldingen
    ADD CONSTRAINT wagenpark_meldingen_voertuig_id_voertuigen_id_fk FOREIGN KEY (voertuig_id) REFERENCES public.voertuigen(id) ON DELETE CASCADE;


--
-- Name: wagenpark_onderhoud wagenpark_onderhoud_gemeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_onderhoud
    ADD CONSTRAINT wagenpark_onderhoud_gemeld_door_id_gebruikers_id_fk FOREIGN KEY (gemeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: wagenpark_onderhoud wagenpark_onderhoud_voertuig_id_voertuigen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_onderhoud
    ADD CONSTRAINT wagenpark_onderhoud_voertuig_id_voertuigen_id_fk FOREIGN KEY (voertuig_id) REFERENCES public.voertuigen(id) ON DELETE CASCADE;


--
-- Name: wagenpark_ritten wagenpark_ritten_project_id_projecten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_ritten
    ADD CONSTRAINT wagenpark_ritten_project_id_projecten_id_fk FOREIGN KEY (project_id) REFERENCES public.projecten(id) ON DELETE SET NULL;


--
-- Name: wagenpark_ritten wagenpark_ritten_voertuig_id_voertuigen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_ritten
    ADD CONSTRAINT wagenpark_ritten_voertuig_id_voertuigen_id_fk FOREIGN KEY (voertuig_id) REFERENCES public.voertuigen(id) ON DELETE CASCADE;


--
-- Name: wagenpark_sync_log wagenpark_sync_log_gestart_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wagenpark_sync_log
    ADD CONSTRAINT wagenpark_sync_log_gestart_door_id_gebruikers_id_fk FOREIGN KEY (gestart_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: week_staten week_staten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.week_staten
    ADD CONSTRAINT week_staten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: week_staten week_staten_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.week_staten
    ADD CONSTRAINT week_staten_document_id_documenten_id_fk FOREIGN KEY (document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: week_staten week_staten_goedgekeurd_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.week_staten
    ADD CONSTRAINT week_staten_goedgekeurd_door_id_gebruikers_id_fk FOREIGN KEY (goedgekeurd_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: week_staten week_staten_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.week_staten
    ADD CONSTRAINT week_staten_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: week_staten week_staten_vergrendeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.week_staten
    ADD CONSTRAINT week_staten_vergrendeld_door_id_gebruikers_id_fk FOREIGN KEY (vergrendeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: werk_inbox_koppelingen werk_inbox_koppelingen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_koppelingen
    ADD CONSTRAINT werk_inbox_koppelingen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: werk_inbox_mailboxen werk_inbox_mailboxen_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_mailboxen
    ADD CONSTRAINT werk_inbox_mailboxen_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: werk_inbox_mails werk_inbox_mails_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_mails
    ADD CONSTRAINT werk_inbox_mails_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: werk_inbox_notities werk_inbox_notities_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_notities
    ADD CONSTRAINT werk_inbox_notities_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: werk_inbox_tokens werk_inbox_tokens_gebruiker_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werk_inbox_tokens
    ADD CONSTRAINT werk_inbox_tokens_gebruiker_id_gebruikers_id_fk FOREIGN KEY (gebruiker_id) REFERENCES public.gebruikers(id) ON DELETE CASCADE;


--
-- Name: werkbegroting_regels werkbegroting_regels_calc_regel_id_mod_calc_regels_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbegroting_regels
    ADD CONSTRAINT werkbegroting_regels_calc_regel_id_mod_calc_regels_id_fk FOREIGN KEY (calc_regel_id) REFERENCES public.mod_calc_regels(id) ON DELETE SET NULL;


--
-- Name: werkbonnen werkbonnen_contract_id_onderhoudscontracten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbonnen
    ADD CONSTRAINT werkbonnen_contract_id_onderhoudscontracten_id_fk FOREIGN KEY (contract_id) REFERENCES public.onderhoudscontracten(id) ON DELETE SET NULL;


--
-- Name: werkbonnen werkbonnen_gebouw_id_gebouwen_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbonnen
    ADD CONSTRAINT werkbonnen_gebouw_id_gebouwen_id_fk FOREIGN KEY (gebouw_id) REFERENCES public.gebouwen(id) ON DELETE SET NULL;


--
-- Name: werkbonnen werkbonnen_monteur_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkbonnen
    ADD CONSTRAINT werkbonnen_monteur_id_gebruikers_id_fk FOREIGN KEY (monteur_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: werkgevers werkgevers_briefpapier_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkgevers
    ADD CONSTRAINT werkgevers_briefpapier_document_id_documenten_id_fk FOREIGN KEY (briefpapier_document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: werkgevers werkgevers_logo_document_id_documenten_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.werkgevers
    ADD CONSTRAINT werkgevers_logo_document_id_documenten_id_fk FOREIGN KEY (logo_document_id) REFERENCES public.documenten(id) ON DELETE SET NULL;


--
-- Name: workflow_cards workflow_cards_lane_id_workflow_lanes_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_cards
    ADD CONSTRAINT workflow_cards_lane_id_workflow_lanes_id_fk FOREIGN KEY (lane_id) REFERENCES public.workflow_lanes(id) ON DELETE CASCADE;


--
-- Name: workflow_cards workflow_cards_workflow_id_workflow_definities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_cards
    ADD CONSTRAINT workflow_cards_workflow_id_workflow_definities_id_fk FOREIGN KEY (workflow_id) REFERENCES public.workflow_definities(id) ON DELETE CASCADE;


--
-- Name: workflow_lanes workflow_lanes_workflow_id_workflow_definities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_lanes
    ADD CONSTRAINT workflow_lanes_workflow_id_workflow_definities_id_fk FOREIGN KEY (workflow_id) REFERENCES public.workflow_definities(id) ON DELETE CASCADE;


--
-- Name: ziekmeldingen ziekmeldingen_gemeld_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ziekmeldingen
    ADD CONSTRAINT ziekmeldingen_gemeld_door_id_gebruikers_id_fk FOREIGN KEY (gemeld_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: ziekmeldingen ziekmeldingen_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ziekmeldingen
    ADD CONSTRAINT ziekmeldingen_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: zzp_overeenkomsten zzp_overeenkomsten_aangemaakt_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zzp_overeenkomsten
    ADD CONSTRAINT zzp_overeenkomsten_aangemaakt_door_id_gebruikers_id_fk FOREIGN KEY (aangemaakt_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- Name: zzp_overeenkomsten zzp_overeenkomsten_medewerker_id_medewerkers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zzp_overeenkomsten
    ADD CONSTRAINT zzp_overeenkomsten_medewerker_id_medewerkers_id_fk FOREIGN KEY (medewerker_id) REFERENCES public.medewerkers(id) ON DELETE CASCADE;


--
-- Name: zzp_overeenkomsten zzp_overeenkomsten_ondertekend_door_id_gebruikers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zzp_overeenkomsten
    ADD CONSTRAINT zzp_overeenkomsten_ondertekend_door_id_gebruikers_id_fk FOREIGN KEY (ondertekend_door_id) REFERENCES public.gebruikers(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict SZBBHOat5XhqAV2WjkgQ44d1k7WWV0ab9cVsTszibzv3TnkOZGDIlSwe3s5IAqK

